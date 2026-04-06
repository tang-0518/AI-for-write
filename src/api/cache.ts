import type { AppSettings } from '../types';

export type CacheActionType = 'continue' | 'polish';

export interface CachedGeneration {
  createdAt: number;
  text: string;
  tokenEstimateIn: number;
  tokenEstimateOut: number;
}

interface CacheRecord {
  key: string;
  value: CachedGeneration;
  expiresAt: number;
  lastAccessAt: number;
}

interface CacheStats {
  l1Hits: number;
  l2Hits: number;
  misses: number;
  writes: number;
}

const STORAGE_KEY = 'novel-ai-cache-v1';
const L1_MAX_ENTRIES = 80;
const L1_TTL_MS = 10 * 60 * 1000;
const L2_MAX_ENTRIES = 200;
const L2_TTL_MS = 6 * 60 * 60 * 1000;

// L1：会话内 Map（最快）
const l1Cache = new Map<string, CacheRecord>();

// L2：localStorage 的内存镜像，模块初始化时从 localStorage 加载一次
//     后续所有读写操作都在这个 Map 上进行，只在 write 时同步序列化到 localStorage
const l2Mirror = new Map<string, CacheRecord>();

const cacheStats: CacheStats = {
  l1Hits: 0,
  l2Hits: 0,
  misses: 0,
  writes: 0,
};

// ── 模块初始化：把 localStorage 一次性加载到 l2Mirror ──────────
(function initL2Mirror() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CacheRecord[];
    if (!Array.isArray(parsed)) return;
    const now = Date.now();
    for (const r of parsed) {
      if (r.expiresAt > now) {
        l2Mirror.set(r.key, r);
      }
    }
  } catch {
    // ignore
  }
})();

function stableHash(input: string): string {
  // FNV-1a 32-bit — 组合两轮不同种子得到伪 64-bit 输出
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

function persistL2(): void {
  try {
    const records = Array.from(l2Mirror.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage 写失败时静默降级
  }
}

function pruneL1(now = Date.now()): void {
  for (const [key, record] of l1Cache.entries()) {
    if (record.expiresAt <= now) l1Cache.delete(key);
  }
  if (l1Cache.size <= L1_MAX_ENTRIES) return;
  const sorted = [...l1Cache.entries()].sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  const overflow = l1Cache.size - L1_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    l1Cache.delete(sorted[i][0]);
  }
}

function pruneL2Mirror(now = Date.now()): void {
  // 清过期
  for (const [key, r] of l2Mirror.entries()) {
    if (r.expiresAt <= now) l2Mirror.delete(key);
  }
  // 按条数 LRU 淘汰
  if (l2Mirror.size <= L2_MAX_ENTRIES) return;
  const sorted = Array.from(l2Mirror.values())
    .sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  const overflow = l2Mirror.size - L2_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    l2Mirror.delete(sorted[i].key);
  }
}

function buildSettingsFingerprint(settings: AppSettings): string {
  return [
    settings.model,
    settings.style,
    settings.writeLength,
    settings.creativity ?? 'balanced',
    settings.customPrompt?.trim() ?? '',
  ].join('||');
}

function takeTailParagraphs(content: string, paragraphCount = 10): string {
  const parts = content
    .split(/\n{1,}/)
    .map(p => p.trim())
    .filter(Boolean);
  return parts.slice(-paragraphCount).join('\n');
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 1.8);
}

export function makeCacheKey(params: {
  actionType: CacheActionType;
  content: string;
  oneTimePrompt: string;
  memoryContext: string;
  staticBlock: string;
  dynamicBlock: string;
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

export function getCache(key: string): CachedGeneration | null {
  const now = Date.now();

  // L1 命中
  const l1 = l1Cache.get(key);
  if (l1 && l1.expiresAt > now) {
    cacheStats.l1Hits += 1;
    l1.lastAccessAt = now;
    return l1.value;
  }

  // L2 命中（O(1) 内存镜像查找）
  const l2 = l2Mirror.get(key);
  if (!l2 || l2.expiresAt <= now) {
    if (l2) l2Mirror.delete(key); // 清理过期
    cacheStats.misses += 1;
    return null;
  }

  cacheStats.l2Hits += 1;
  l2.lastAccessAt = now;

  // 提升到 L1
  l1Cache.set(key, {
    key,
    value: l2.value,
    expiresAt: now + L1_TTL_MS,
    lastAccessAt: now,
  });
  pruneL1(now);

  return l2.value;
}

export function setCache(key: string, value: CachedGeneration): void {
  const now = Date.now();
  cacheStats.writes += 1;

  // 写 L1
  l1Cache.set(key, {
    key,
    value,
    expiresAt: now + L1_TTL_MS,
    lastAccessAt: now,
  });
  pruneL1(now);

  // 写 L2 镜像
  l2Mirror.set(key, {
    key,
    value,
    expiresAt: now + L2_TTL_MS,
    lastAccessAt: now,
  });
  pruneL2Mirror(now);

  // 序列化到 localStorage（仅在 write 时发生，不阻塞读）
  persistL2();
}

export function clearGenerationCache(): void {
  l1Cache.clear();
  l2Mirror.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

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
