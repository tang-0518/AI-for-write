// =============================================================
// memory/storage.ts — 记忆宫殿 CRUD（IndexedDB 持久化）
// =============================================================

import type { MemoryEntry, MemoryType } from './types';
import type { ExtractedMemoryItem } from '../api/gemini';
import type { NovelEntity } from '../graph/types';
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
    .sort((a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt));
  const notes       = entries.filter(e => e.type === 'note');

  const rankByQueryOrRecency = (a: MemoryEntry, b: MemoryEntry) => (
    query.trim()
      ? scoreRelevance(b, query) - scoreRelevance(a, query)
      : b.updatedAt - a.updatedAt
  );

  const rankedChars  = characters.slice().sort(rankByQueryOrRecency);
  const rankedWorlds = worldRules.slice().sort(rankByQueryOrRecency);
  const rankedNotes  = notes.slice().sort(rankByQueryOrRecency);

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
  const worldStat = buildSection(rankedWorlds, 'world_rule', '世界设定', '#60a5fa', SECTION_BUDGETS.world_rule, 200);
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
  const noteStat = buildSection(rankedNotes, 'note', '笔记', '#fbbf24', Math.min(SECTION_BUDGETS.note, noteBudget), 200);
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

async function buildGraphObservationLines(
  bookId: string | undefined,
  totalBudget: number,
  totalUsed: number,
): Promise<{ lines: string[]; tokenCount: number }> {
  if (!bookId) return { lines: [], tokenCount: 0 };

  const graphTokenBudget = Math.min(200, Math.max(0, totalBudget - totalUsed - 50));
  if (graphTokenBudget <= 0) return { lines: [], tokenCount: 0 };

  try {
    const allEntities = await dbGetAll<NovelEntity>('graph_entities');
    const rankedCharacters = allEntities
      .filter(entity =>
        entity.bookId === bookId
        && entity.type === 'character'
        && entity.observations.some(observation => observation.trim()),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const lines: string[] = [];
    let tokenCount = 0;

    for (const entity of rankedCharacters) {
      const recentObservations = entity.observations
        .map(observation => observation.trim())
        .filter(Boolean)
        .slice(-3)
        .join('；');
      if (!recentObservations) continue;

      const line = `${entity.name}（图谱）：${recentObservations}`;
      const cost = estimateTokens(line);
      if (tokenCount + cost > graphTokenBudget) break;

      lines.push(line);
      tokenCount += cost;
    }

    return { lines, tokenCount };
  } catch {
    return { lines: [], tokenCount: 0 };
  }
}

export async function buildMemoryContextDetailedAsync(
  entries: MemoryEntry[],
  query = '',
  totalBudget = 1500,
  bookId?: string,
): Promise<MemoryContextDetailed> {
  const base = buildMemoryContextDetailed(entries, query, totalBudget);
  const graphObs = await buildGraphObservationLines(bookId, totalBudget, base.totalTokens);

  if (graphObs.lines.length === 0) return base;

  const context = base.context
    ? `${base.context}\n【角色动态】\n${graphObs.lines.join('\n')}`
    : `【记忆宫殿】\n【角色动态】\n${graphObs.lines.join('\n')}`;

  return {
    ...base,
    context,
    totalTokens: base.totalTokens + graphObs.tokenCount,
  };
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

export async function buildMemoryContextForBookAsync(
  entries: MemoryEntry[],
  query = '',
  tokenBudget = 1500,
  bookId?: string,
): Promise<string> {
  const result = await buildMemoryContextDetailedAsync(entries, query, tokenBudget, bookId);
  return result.context;
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
function isSimilarContent(a: string, b: string): boolean {
  if (!a || !b) return false;

  const normalizedA = a.trim();
  const normalizedB = b.trim();
  if (!normalizedA || !normalizedB) return false;

  const shorter = normalizedA.length <= normalizedB.length ? normalizedA : normalizedB;
  const longer = normalizedA.length <= normalizedB.length ? normalizedB : normalizedA;
  if (longer.includes(shorter)) return true;

  const setA = new Set(normalizedA.split(''));
  const setB = new Set(normalizedB.split(''));
  let overlap = 0;
  for (const ch of setA) {
    if (setB.has(ch)) overlap++;
  }

  return overlap / Math.max(setA.size, setB.size) >= 0.75;
}

function mergeContents(oldContent: string, incomingContent: string, maxLength: number): string {
  const merged = `${oldContent}；${incomingContent}`;
  if (merged.length <= maxLength) return merged;

  const keepOld = Math.max(0, maxLength - incomingContent.length - 1);
  return `${oldContent.slice(-keepOld)}；${incomingContent}`.slice(0, maxLength);
}

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

    if (existing) {
      const newContent = item.content.trim();
      const oldContent = existing.content.trim();
      const mergedContent = isSimilarContent(oldContent, newContent)
        ? oldContent
        : mergeContents(oldContent, newContent, 600);

      const updated = await upsertMemoryAsync({
        ...existing,
        description: existing.description ?? '',
        content: mergedContent,
        bookId,
        autoExtracted: true,
        id: existing.id,
      });

      const index = current.findIndex(entry => entry.id === existing.id);
      if (index >= 0) current[index] = updated;
      continue;
    }

    const created = await upsertMemoryAsync({
      name: item.name.trim(),
      description: '',
      type: item.type,
      content: item.content.trim(),
      bookId,
      autoExtracted: true,
    });
    current.push(created);
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
