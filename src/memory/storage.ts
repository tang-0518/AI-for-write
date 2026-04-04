// =============================================================
// memory/storage.ts — 记忆库 CRUD（IndexedDB 持久化）
// =============================================================

import type { MemoryEntry, MemoryType } from './types';
import { dbGetAll, dbPut, dbDelete } from '../db/index';

const MAX_ENTRIES = 200;
const MEMORY_DEFAULT_TOKEN_BUDGET = 1500;

// ── 读取全部记忆 ──────────────────────────────────────────────
export async function loadMemoriesAsync(): Promise<MemoryEntry[]> {
  try {
    const all = await dbGetAll<MemoryEntry>('memories');
    return all.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

// ── 新增 / 更新 ───────────────────────────────────────────────
export async function upsertMemoryAsync(
  entry: Omit<MemoryEntry, 'id' | 'updatedAt'> & { id?: string },
): Promise<MemoryEntry> {
  const now = Date.now();
  const id = entry.id ?? `mem_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const updated: MemoryEntry = { ...entry, id, updatedAt: now };
  await dbPut('memories', updated);
  return updated;
}

// ── 删除 ──────────────────────────────────────────────────────
export async function deleteMemoryAsync(id: string): Promise<void> {
  await dbDelete('memories', id);
}

// ── 构建注入到 Prompt 的记忆上下文 ───────────────────────────
export function buildMemoryContext(entries: MemoryEntry[]): string {
  const { context } = buildRelevantMemoryContext(entries, '', MEMORY_DEFAULT_TOKEN_BUDGET);
  return context;
}

function typeWeight(type: MemoryType): number {
  if (type === 'project')  return 1.4;
  if (type === 'feedback') return 1.2;
  if (type === 'reference') return 1.0;
  return 0.8;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 1.8);
}

function buildDigest(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.slice(0, 6).map(e => `- ${e.name}：${e.content.slice(0, 50)}`);
  return ['【记忆摘要】（以下为低优先记忆压缩摘要）', ...lines].join('\n');
}

export interface MemoryBuildResult {
  context: string;
  selected: MemoryEntry[];
  digest: string;
  tokenEstimate: number;
}

export function buildRelevantMemoryContext(
  entries: MemoryEntry[],
  query: string,
  tokenBudget: number = MEMORY_DEFAULT_TOKEN_BUDGET,
): MemoryBuildResult {
  if (entries.length === 0) {
    return { context: '', selected: [], digest: '', tokenEstimate: 0 };
  }

  const order: MemoryType[] = ['project', 'feedback', 'reference', 'user'];
  const ranked = entries
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(entry => ({ entry, weighted: scoreRelevance(entry, query) * typeWeight(entry.type) }))
    .sort((a, b) => b.weighted - a.weighted || b.entry.updatedAt - a.entry.updatedAt)
    .map(r => r.entry);

  const selected: MemoryEntry[] = [];
  const dropped: MemoryEntry[] = [];
  const lines: string[] = ['【长期记忆库】（以下背景信息始终有效，请据此创作）'];
  let used = estimateTokens(lines[0]);

  for (const type of order) {
    for (const e of ranked.filter(x => x.type === type)) {
      const line = `[${type}] ${e.name}：${e.content.slice(0, 400)}`;
      const cost = estimateTokens(line);
      if (used + cost <= tokenBudget) {
        lines.push(line);
        selected.push(e);
        used += cost;
      } else {
        dropped.push(e);
      }
    }
  }

  const digest = buildDigest(dropped);
  const digestCost = estimateTokens(digest);
  if (digest && used + digestCost <= tokenBudget) {
    lines.push(digest);
    used += digestCost;
  }

  return { context: lines.join('\n'), selected, digest, tokenEstimate: used };
}

/**
 * 将查询字符串拆成检索词：
 * - 英文：按空白分词
 * - 中文：字符级一元组 + 二元组（相邻两字）
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 英文词
  for (const w of text.toLowerCase().split(/\s+/)) {
    if (w) tokens.push(w);
  }
  // 中文字符：一元 + 二元
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? [];
  for (const ch of cjk) tokens.push(ch);
  for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk[i] + cjk[i + 1]);
  return tokens;
}

export function scoreRelevance(entry: MemoryEntry, query: string): number {
  if (!query.trim()) return 0;
  const tokens = tokenize(query);
  const nameLow = entry.name.toLowerCase();
  const descLow = entry.description.toLowerCase();
  const bodyLow = entry.content.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (nameLow.includes(t))  score += 2;
    if (descLow.includes(t))  score += 1;
    if (bodyLow.includes(t))  score += 0.5;
  }
  return score;
}

// ── 向后兼容的同步 shim（内部仍有 localStorage fallback，渐进废弃）──
// 以下函数仅供 useMemory 在 IndexedDB 加载完成前短暂使用
export function loadMemories(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem('novel-ai-memories');
    return raw ? (JSON.parse(raw) as MemoryEntry[]) : [];
  } catch { return []; }
}
export function upsertMemory(entry: Omit<MemoryEntry, 'id' | 'updatedAt'> & { id?: string }): MemoryEntry {
  const now = Date.now();
  const id = entry.id ?? `mem_${now}_${Math.random().toString(36).slice(2, 7)}`;
  return { ...entry, id, updatedAt: now };
}
export function deleteMemory(_id: string): void { /* no-op shim */ }
