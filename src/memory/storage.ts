// =============================================================
// memory/storage.ts — 记忆宫殿 CRUD（IndexedDB 持久化）
// =============================================================

import type { MemoryEntry, MemoryType } from './types';
import type { ExtractedMemoryItem } from '../api/gemini';
import { dbGetAll, dbPut, dbDelete } from '../db/index';

const MAX_ENTRIES = 500;

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

// ── Token 估算（中文 1字≈1.5 token） ─────────────────────────
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 1.5);
}

// ── 各分区的 token 硬上限 ─────────────────────────────────────
export const SECTION_BUDGETS = {
  character:       600,
  world_rule:      300,
  chapter_summary: 400,
  note:            200,   // 剩余预算兜底
} as const;

// ── 可视化用：详细构建结果 ───────────────────────────────────
export interface SectionStat {
  type: MemoryType;
  label: string;
  color: string;
  included: MemoryEntry[];   // 实际注入的条目
  excluded: MemoryEntry[];   // 因预算不足被截断的条目
  tokens: number;            // 本区实际消耗 tokens
  budgetCap: number;         // 本区最大 token 配额
}

export interface MemoryContextDetailed {
  context: string;
  totalTokens: number;
  totalBudget: number;
  sections: SectionStat[];
}

export function buildMemoryContextDetailed(
  entries: MemoryEntry[],
  query = '',
  totalBudget = 1500,
): MemoryContextDetailed {
  const characters  = entries.filter(e => e.type === 'character');
  const worldRules  = entries.filter(e => e.type === 'world_rule');
  const chapterSums = entries
    .filter(e => e.type === 'chapter_summary')
    .sort((a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt))
    .slice(0, 3);
  const notes       = entries.filter(e => e.type === 'note');

  const rankedChars = query.trim()
    ? characters.slice().sort((a, b) => scoreRelevance(b, query) - scoreRelevance(a, query))
    : characters.slice().sort((a, b) => b.updatedAt - a.updatedAt);

  const sections: SectionStat[] = [];
  const contextParts: string[] = [];
  let totalUsed = 0;

  // 角色档案
  const charStat = buildSection(rankedChars, 'character', '角色档案', '#f87171', SECTION_BUDGETS.character, 300);
  sections.push(charStat);
  if (charStat.included.length > 0) {
    contextParts.push('【角色档案】\n' + charStat.included.map(e => `${e.name}：${e.content.slice(0, 300)}`).join('\n'));
  }
  totalUsed += charStat.tokens;

  // 世界设定
  const worldStat = buildSection(worldRules, 'world_rule', '世界设定', '#60a5fa', SECTION_BUDGETS.world_rule, 200);
  sections.push(worldStat);
  if (worldStat.included.length > 0) {
    contextParts.push('【世界设定】\n' + worldStat.included.map(e => `${e.name}：${e.content.slice(0, 200)}`).join('\n'));
  }
  totalUsed += worldStat.tokens;

  // 章节摘要
  const sumStat = buildSection(chapterSums, 'chapter_summary', '近章摘要', '#34d399', SECTION_BUDGETS.chapter_summary, 200);
  sections.push(sumStat);
  if (sumStat.included.length > 0) {
    contextParts.push('【近章摘要】\n' + sumStat.included.map(e => `${e.name}：${e.content.slice(0, 200)}`).join('\n'));
  }
  totalUsed += sumStat.tokens;

  // 笔记（剩余预算）
  const noteBudget = Math.max(0, totalBudget - totalUsed);
  const noteStat = buildSection(notes, 'note', '笔记', '#fbbf24', Math.min(SECTION_BUDGETS.note, noteBudget), 200);
  sections.push(noteStat);
  if (noteStat.included.length > 0) {
    contextParts.push(noteStat.included.map(e => `${e.name}：${e.content.slice(0, 200)}`).join('\n'));
  }
  totalUsed += noteStat.tokens;

  const context = contextParts.length > 0
    ? '【记忆宫殿】\n' + contextParts.join('\n')
    : '';

  return { context, totalTokens: totalUsed, totalBudget, sections };
}

function buildSection(
  entries: MemoryEntry[],
  type: MemoryType,
  label: string,
  color: string,
  budgetCap: number,
  contentMaxChars: number,
): SectionStat {
  const included: MemoryEntry[] = [];
  const excluded: MemoryEntry[] = [];
  let tokens = 0;

  for (const e of entries) {
    const line = `${e.name}：${e.content.slice(0, contentMaxChars)}`;
    const cost = estimateTokens(line);
    if (tokens + cost <= budgetCap) {
      included.push(e);
      tokens += cost;
    } else {
      excluded.push(e);
    }
  }

  return { type, label, color, included, excluded, tokens, budgetCap };
}

// ── 为续写构建注入上下文（简化版，供 Hook 使用） ─────────────
export function buildMemoryContextForBook(
  entries: MemoryEntry[],
  query = '',
  tokenBudget = 1500,
): string {
  return buildMemoryContextDetailed(entries, query, tokenBudget).context;
}

// 相关度评分（BM25-like）
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const w of text.toLowerCase().split(/\s+/)) {
    if (w) tokens.push(w);
  }
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? [];
  for (const ch of cjk) tokens.push(ch);
  for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk[i] + cjk[i + 1]);
  return tokens;
}

export function scoreRelevance(entry: MemoryEntry, query: string): number {
  if (!query.trim()) return 0;
  const tokens = tokenize(query);
  const nameLow = entry.name.toLowerCase();
  const bodyLow = entry.content.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (nameLow.includes(t)) score += 2;
    if (bodyLow.includes(t)) score += 0.5;
  }
  return score;
}

// ── 自动提取：upsert 提取的实体列表到记忆宫殿 ─────────────────
// type + name 完全匹配视为同一条目 → 更新内容；否则新增
export async function upsertExtractedItems(
  items: ExtractedMemoryItem[],
  bookId: string,
): Promise<void> {
  if (items.length === 0) return;
  const current = await loadMemoriesAsync();
  for (const item of items) {
    const existing = current.find(
      e => e.type === item.type
        && e.name.trim() === item.name.trim()
        && (!e.bookId || e.bookId === bookId),
    );
    await upsertMemoryAsync({
      ...(existing ?? {}),
      name: item.name.trim(),
      description: '',
      type: item.type,
      content: item.content,
      bookId,
      autoExtracted: true,
      id: existing?.id,
    });
  }
}

// ── 章节摘要：同一章节序号只保留一条（重复完成时覆盖）──────────
export async function saveChapterSummaryEntry(
  chapterTitle: string,
  summary: string,
  chapterOrder: number,
  bookId: string,
): Promise<void> {
  if (!summary.trim()) return;
  const current = await loadMemoriesAsync();
  const existing = current.find(
    e => e.type === 'chapter_summary'
      && e.chapterOrder === chapterOrder
      && e.bookId === bookId,
  );
  await upsertMemoryAsync({
    ...(existing ?? {}),
    name: chapterTitle,
    description: `第 ${chapterOrder + 1} 章摘要`,
    type: 'chapter_summary',
    content: summary,
    bookId,
    autoExtracted: true,
    chapterOrder,
    id: existing?.id,
  });
}

export interface MemoryBuildResult {
  context: string;
  selected: MemoryEntry[];
  digest: string;
  tokenEstimate: number;
}

// ── 向后兼容 shim ─────────────────────────────────────────────
export function buildRelevantMemoryContext(
  entries: MemoryEntry[],
  query: string,
  tokenBudget = 1500,
): MemoryBuildResult {
  const { context, totalTokens } = buildMemoryContextDetailed(entries, query, tokenBudget);
  return { context, selected: entries, digest: '', tokenEstimate: totalTokens };
}
