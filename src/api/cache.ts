// =============================================================
// api/cache.ts — AI 生成结果的两级缓存
//
// 【职责】
//   避免相同内容重复调用 Gemini API，节省 token 和等待时间。
//   只要用户的正文尾段 + 设置 + 指令没有变化，直接返回缓存结果。
//
// 【两级缓存架构】
//
//   L1（内存 Map）── 会话内，TTL 10分钟，最多80条
//       ↓ miss
//   L2（localStorage 镜像 Map）── 跨刷新，TTL 6小时，最多200条
//       ↓ miss
//   Gemini API 请求
//
//   L2 不直接读 localStorage（避免每次反序列化），
//   而是在模块加载时一次性全量读入内存 Map（l2Mirror），
//   写入时才序列化回 localStorage。
//
// 【被哪些文件使用】
//   api/gemini.ts — 续写/润色命中缓存时直接返回，跳过 API 请求
//   hooks/useMemory.ts — 记忆更新后调用 clearGenerationCache() 使缓存失效
//   App.tsx — 调用 getCacheStats() 在设置面板展示命中率
// =============================================================

import type { AppSettings } from '../types';

// 操作类型，作为缓存 key 的一部分，区分续写和不同润色模式
export type CacheActionType = 'continue' | 'polish' | `polish:${string}`;

// 存储每次 AI 生成结果的结构
export interface CachedGeneration {
  createdAt: number;
  text: string;
  tokenEstimateIn: number;   // 估算的输入 token 数（用于统计）
  tokenEstimateOut: number;  // 估算的输出 token 数
}

// 内部存储记录，附带 TTL 和 LRU 信息
interface CacheRecord {
  key: string;
  value: CachedGeneration;
  expiresAt: number;      // Unix ms，超过此时间视为过期
  lastAccessAt: number;   // 用于 LRU 淘汰：最早访问的记录优先删除
}

interface CacheStats {
  l1Hits: number;
  l2Hits: number;
  misses: number;
  writes: number;
}

// ── 常量 ──────────────────────────────────────────────────────
const STORAGE_KEY = 'novel-ai-cache-v1';
const L1_MAX_ENTRIES = 80;
const L1_TTL_MS = 10 * 60 * 1000;         // 10 分钟
const L2_MAX_ENTRIES = 200;
const L2_TTL_MS = 6 * 60 * 60 * 1000;    // 6 小时

// L1：纯内存，会话内最快（刷新后消失）
const l1Cache = new Map<string, CacheRecord>();

// L2：localStorage 的内存镜像。
//   - 模块首次 import 时，从 localStorage 全量读入此 Map（见下方 IIFE）
//   - 后续读操作：O(1) 内存 Map 查找，无需解析 JSON
//   - 后续写操作：更新 Map 同时序列化到 localStorage
const l2Mirror = new Map<string, CacheRecord>();

const cacheStats: CacheStats = {
  l1Hits: 0,
  l2Hits: 0,
  misses: 0,
  writes: 0,
};

// ── 模块初始化：把 localStorage 一次性加载到 l2Mirror ──────────
// 使用 IIFE（立即执行函数）在模块加载时同步执行，避免异步复杂度
(function initL2Mirror() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CacheRecord[];
    if (!Array.isArray(parsed)) return;
    const now = Date.now();
    for (const r of parsed) {
      // 只加载未过期的记录
      if (r.expiresAt > now) {
        l2Mirror.set(r.key, r);
      }
    }
  } catch {
    // localStorage 不可用时静默降级
  }
})();

// ── 哈希函数 ──────────────────────────────────────────────────
// 使用 FNV-1a 32-bit 算法，两轮不同种子模拟 64-bit 输出，减少碰撞。
// 比 crypto.subtle 更轻量，且是同步的（适合频繁调用的 cache key 计算）
function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x01000193) ^ (h2 >>> 7);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return p1 + p2;
}

// 将 l2Mirror 序列化到 localStorage（仅在写入时调用，不阻塞读）
function persistL2(): void {
  try {
    const records = Array.from(l2Mirror.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage 写满时静默降级（不崩溃）
  }
}

// ── LRU 淘汰逻辑 ──────────────────────────────────────────────
// 先清过期，再按 lastAccessAt 淘汰最旧的条目

function pruneL1(now = Date.now()): void {
  for (const [key, record] of l1Cache.entries()) {
    if (record.expiresAt <= now) l1Cache.delete(key);
  }
  if (l1Cache.size <= L1_MAX_ENTRIES) return;
  // 按最后访问时间排序，删除最旧的
  const sorted = [...l1Cache.entries()].sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  const overflow = l1Cache.size - L1_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    l1Cache.delete(sorted[i][0]);
  }
}

function pruneL2Mirror(now = Date.now()): void {
  for (const [key, r] of l2Mirror.entries()) {
    if (r.expiresAt <= now) l2Mirror.delete(key);
  }
  if (l2Mirror.size <= L2_MAX_ENTRIES) return;
  const sorted = Array.from(l2Mirror.values())
    .sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  const overflow = l2Mirror.size - L2_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    l2Mirror.delete(sorted[i].key);
  }
}

// ── Cache Key 构建 ────────────────────────────────────────────
// 设置指纹：只取影响 AI 输出的关键字段，忽略 UI 偏好字段
function buildSettingsFingerprint(settings: AppSettings): string {
  return [
    settings.model,
    settings.style,
    settings.writeLength,
    settings.creativity ?? 'balanced',
    settings.customPrompt?.trim() ?? '',
  ].join('||');
}

// 正文只取末尾10段：正文前半部分几乎不影响 AI 的续写结果，
// 而且每次续写后正文都会增长，哈希整段正文会导致缓存永远 miss
function takeTailParagraphs(content: string, paragraphCount = 10): string {
  const parts = content
    .split(/\n{1,}/)
    .map(p => p.trim())
    .filter(Boolean);
  return parts.slice(-paragraphCount).join('\n');
}

// Token 估算（供 gemini.ts 在存入缓存时记录用量）
// 中文字符约 1 token/char，ASCII/标点约 0.25-0.3 token/char
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let tokens = 0;
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x4e00 && code <= 0x9fff) tokens += 1.0;        // CJK 主区
    else if (code >= 0x3000 && code <= 0x9fff) tokens += 0.8;   // 全角标点/扩展CJK
    else tokens += 0.3;                                           // ASCII/半角标点
  }
  return Math.ceil(tokens);
}

// 生成稳定的缓存 key：对所有影响输出的因素取哈希后再哈希一次
export function makeCacheKey(params: {
  actionType: CacheActionType;
  content: string;
  oneTimePrompt: string;
  memoryContext: string;
  staticBlock: string;    // systemInstruction 文本
  dynamicBlock: string;   // 用户消息文本
  settings: AppSettings;
}): string {
  const payload = {
    actionType: params.actionType,
    settings: buildSettingsFingerprint(params.settings),
    staticBlockHash: stableHash(params.staticBlock),
    dynamicBlockHash: stableHash(params.dynamicBlock),
    memoryHash: stableHash(params.memoryContext),
    oneTimePrompt: params.oneTimePrompt.trim(),
    contentTailHash: stableHash(takeTailParagraphs(params.content)),
  };
  return `v1:${stableHash(JSON.stringify(payload))}`;
}

// ── 读缓存 ────────────────────────────────────────────────────
// 先查 L1，再查 L2；L2 命中时提升到 L1（热数据加速）
export function getCache(key: string): CachedGeneration | null {
  const now = Date.now();

  // L1 命中：最快路径，无 JSON 解析开销
  const l1 = l1Cache.get(key);
  if (l1 && l1.expiresAt > now) {
    cacheStats.l1Hits += 1;
    l1.lastAccessAt = now;
    return l1.value;
  }

  // L2 命中：内存 Map，O(1)，比 localStorage.getItem 快
  const l2 = l2Mirror.get(key);
  if (!l2 || l2.expiresAt <= now) {
    if (l2) l2Mirror.delete(key); // 清理过期条目
    cacheStats.misses += 1;
    return null;
  }

  cacheStats.l2Hits += 1;
  l2.lastAccessAt = now;

  // 将 L2 命中的记录提升到 L1，下次直接从 L1 拿
  l1Cache.set(key, {
    key,
    value: l2.value,
    expiresAt: now + L1_TTL_MS,
    lastAccessAt: now,
  });
  pruneL1(now);

  return l2.value;
}

// ── 写缓存 ────────────────────────────────────────────────────
// 同时写入 L1 和 L2，并立即序列化到 localStorage
export function setCache(key: string, value: CachedGeneration): void {
  const now = Date.now();
  cacheStats.writes += 1;

  l1Cache.set(key, {
    key,
    value,
    expiresAt: now + L1_TTL_MS,
    lastAccessAt: now,
  });
  pruneL1(now);

  l2Mirror.set(key, {
    key,
    value,
    expiresAt: now + L2_TTL_MS,
    lastAccessAt: now,
  });
  pruneL2Mirror(now);

  // 序列化到 localStorage，只在写时触发（读不触发）
  persistL2();
}

// ── 清空缓存 ──────────────────────────────────────────────────
// 记忆宫殿更新后调用，确保下次续写使用最新记忆
export function clearGenerationCache(): void {
  l1Cache.clear();
  l2Mirror.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── 命中率统计（供设置面板展示） ─────────────────────────────
export function getCacheStats() {
  const totalReads = cacheStats.l1Hits + cacheStats.l2Hits + cacheStats.misses;
  const totalHits = cacheStats.l1Hits + cacheStats.l2Hits;
  const hitRate = totalReads > 0 ? totalHits / totalReads : 0;
  return {
    ...cacheStats,
    totalReads,
    totalHits,
    hitRate,
    l1Size: l1Cache.size,
    l2Size: l2Mirror.size,
  };
}

export function resetCacheStats(): void {
  cacheStats.l1Hits = 0;
  cacheStats.l2Hits = 0;
  cacheStats.misses = 0;
  cacheStats.writes = 0;
}
