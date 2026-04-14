// =============================================================
// api/memoryService.ts — 统一记忆上下文服务层
//
// 【职责】
//   作为 AI Prompt 上下文的唯一装配出口：
//   ① 知识图谱（KG） - 结构化实体/关系，来自 MCP server JSONL
//   ② IndexedDB     - 章节摘要 + 笔记（叙事流水账）
//
//   KG 不可达时自动降级为纯 IndexedDB 模式（软依赖）。
//
// 【核心类型】
//   ContextEntry    — 单条注入内容（name + content + token 数 + 来源）
//   ContextSection  — 一组同类内容（角色/世界/摘要/笔记）的结构化描述
//   ContextBundle   — 完整的上下文装配结果，包含 promptText + 可视化元数据
//
// 【调用方】
//   useMemory.buildContextBundle() → useEditor → gemini.ts
//   ContextInspector 组件读取 ContextBundle 做可视化展示
// =============================================================

import type { MemoryEntry } from '../memory/types';
import { estimateTokens } from '../memory/storage';
import { readGraph } from '../graph/storage';

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/** 数据来源：知识图谱或本地 IndexedDB */
export type ContextSource = 'kg' | 'local';

/** 单条注入内容 */
export interface ContextEntry {
  id:         string;
  name:       string;
  summary:    string;   // 注入到 prompt 的压缩文本
  source:     ContextSource;
  tokenCount: number;
}

/** 一个 section 的完整描述（可视化用） */
export interface ContextSection {
  key:        string;
  label:      string;
  emoji:      string;
  color:      string;
  source:     ContextSource;
  included:   ContextEntry[];
  excluded:   ContextEntry[];   // 因 token 预算不足被截断的条目
  tokenCount: number;
  tokenBudget: number;
}

/** 完整的上下文装配结果 */
export interface ContextBundle {
  novelTitle:   string;
  query:        string;
  sections:     ContextSection[];
  totalTokens:  number;
  totalBudget:  number;
  kgAvailable:  boolean;
  promptText:   string;   // 最终注入 prompt 的字符串
}

// ─────────────────────────────────────────────────────────────
// Token 预算（各 section 上限）
// ─────────────────────────────────────────────────────────────

const BUDGETS = {
  character:       600,
  world_rule:      300,
  chapter_summary: 400,
  note:            200,
} as const;

const TOTAL_BUDGET = 1500;

// ─────────────────────────────────────────────────────────────
// 内部工具：相关性评分（BM25-like，复制自 memory/storage.ts）
// ─────────────────────────────────────────────────────────────

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

function scoreRelevance(name: string, content: string, query: string): number {
  if (!query.trim()) return 0;
  const queryTokens = tokenize(query);
  const nameLow  = name.toLowerCase();
  const bodyLow  = content.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (nameLow.includes(t)) score += 2;
    if (bodyLow.includes(t)) score += 0.5;
  }
  return score;
}

// ─────────────────────────────────────────────────────────────
// 内部工具：section 装配（token 截断）
// ─────────────────────────────────────────────────────────────

function buildSection(
  entries:      ContextEntry[],
  key:          string,
  label:        string,
  emoji:        string,
  color:        string,
  source:       ContextSource,
  tokenBudget:  number,
): ContextSection {
  const included: ContextEntry[] = [];
  const excluded: ContextEntry[] = [];
  let tokenCount = 0;

  for (const e of entries) {
    if (tokenCount + e.tokenCount <= tokenBudget) {
      included.push(e);
      tokenCount += e.tokenCount;
    } else {
      excluded.push(e);
    }
  }

  return { key, label, emoji, color, source, included, excluded, tokenCount, tokenBudget };
}

// ─────────────────────────────────────────────────────────────
// KG 实体 → ContextEntry 转换
// ─────────────────────────────────────────────────────────────

interface KGEntity {
  id:           string;
  name:         string;
  type:         string;
  attributes:   Record<string, string>;
  observations: string[];
  tags:         string[];
}

const MAX_CONTENT_CHARS = 280;

function kgEntityToEntry(entity: KGEntity): ContextEntry {
  const attrStr = Object.entries(entity.attributes)
    .slice(0, 4)
    .map(([k, v]) => `${k}:${v}`)
    .join('、');
  const obsStr = entity.observations.slice(0, 3).join('；');
  const summary = [attrStr, obsStr].filter(Boolean).join('  ').slice(0, MAX_CONTENT_CHARS);
  const line = `${entity.name}${summary ? `：${summary}` : ''}`;
  return {
    id:         entity.id,
    name:       entity.name,
    summary,
    source:     'kg',
    tokenCount: estimateTokens(line),
  };
}

// ─────────────────────────────────────────────────────────────
// MemoryEntry → ContextEntry 转换
// ─────────────────────────────────────────────────────────────

function memoryEntryToContextEntry(entry: MemoryEntry): ContextEntry {
  const summary = entry.content.slice(0, MAX_CONTENT_CHARS);
  const line    = `${entry.name}：${summary}`;
  return {
    id:         entry.id,
    name:       entry.name,
    summary,
    source:     'local',
    tokenCount: estimateTokens(line),
  };
}

// ─────────────────────────────────────────────────────────────
// 读取 KG（IndexedDB，不再依赖 MCP server HTTP）
// ─────────────────────────────────────────────────────────────

interface KGGraph {
  bookId:    string;
  entities:  KGEntity[];
  relations: Array<{ from: string; to: string; relationType: string; weight: number }>;
}

async function fetchKGGraph(bookId: string): Promise<KGGraph | null> {
  try {
    const graph = await readGraph(bookId);
    if (graph.entities.length === 0 && graph.relations.length === 0) return null;
    return {
      bookId:    graph.bookId,
      entities:  graph.entities as unknown as KGEntity[],
      relations: graph.relations,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 主函数：装配 ContextBundle
// ─────────────────────────────────────────────────────────────

export async function buildContextBundle(
  bookId:       string,
  localEntries: MemoryEntry[],   // 当前书目的 IndexedDB 条目
  query        = '',
  totalBudget  = TOTAL_BUDGET,
): Promise<ContextBundle> {

  // ── 1. 尝试获取 KG 数据（IndexedDB） ──────────────────────
  const kg = await fetchKGGraph(bookId);
  const kgAvailable = kg !== null;

  // ── 2. 构建各 section ─────────────────────────────────────

  const sections: ContextSection[] = [];
  const promptParts: string[] = [];
  let totalTokens = 0;

  // ── 2a. KG 角色（或 fallback：IndexedDB character）─────────
  const charBudget = Math.min(BUDGETS.character, totalBudget - totalTokens);
  if (kgAvailable && charBudget > 0) {
    const kgChars = kg!.entities
      .filter(e => e.type === 'character' || e.type === 'faction')
      .map(kgEntityToEntry);

    // 若有查询词，按相关性排序
    const ranked = query.trim()
      ? kgChars.slice().sort((a, b) => scoreRelevance(b.name, b.summary, query) - scoreRelevance(a.name, a.summary, query))
      : kgChars;

    const sec = buildSection(ranked, 'character', '角色', '👤', '#f87171', 'kg', charBudget);
    sections.push(sec);
    if (sec.included.length > 0) {
      promptParts.push('【角色档案（知识图谱）】\n' + sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
    }
    totalTokens += sec.tokenCount;
  } else if (!kgAvailable) {
    // Fallback：IndexedDB character
    const localChars = localEntries
      .filter(e => e.type === 'character')
      .map(memoryEntryToContextEntry);
    const ranked = query.trim()
      ? localChars.slice().sort((a, b) => scoreRelevance(b.name, b.summary, query) - scoreRelevance(a.name, a.summary, query))
      : localChars;
    const sec = buildSection(ranked, 'character', '角色', '👤', '#f87171', 'local', charBudget);
    sections.push(sec);
    if (sec.included.length > 0) {
      promptParts.push('【角色档案】\n' + sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
    }
    totalTokens += sec.tokenCount;
  }

  // ── 2b. KG 世界规则/地点/势力（或 fallback：IndexedDB world_rule）
  const worldBudget = Math.min(BUDGETS.world_rule, totalBudget - totalTokens);
  if (worldBudget > 0) {
    if (kgAvailable) {
      const kgWorld = kg!.entities
        .filter(e => ['world_rule', 'location', 'item'].includes(e.type))
        .map(kgEntityToEntry);
      const sec = buildSection(kgWorld, 'world_rule', '世界设定', '🌍', '#60a5fa', 'kg', worldBudget);
      sections.push(sec);
      if (sec.included.length > 0) {
        promptParts.push('【世界设定（知识图谱）】\n' + sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
      }
      totalTokens += sec.tokenCount;
    } else {
      const localWorld = localEntries
        .filter(e => e.type === 'world_rule')
        .map(memoryEntryToContextEntry);
      const sec = buildSection(localWorld, 'world_rule', '世界设定', '🌍', '#60a5fa', 'local', worldBudget);
      sections.push(sec);
      if (sec.included.length > 0) {
        promptParts.push('【世界设定】\n' + sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
      }
      totalTokens += sec.tokenCount;
    }
  }

  // ── 2c. 章节摘要（始终来自 IndexedDB，是叙事流水账）─────────
  const sumBudget = Math.min(BUDGETS.chapter_summary, totalBudget - totalTokens);
  if (sumBudget > 0) {
    const summaries = localEntries
      .filter(e => e.type === 'chapter_summary')
      .sort((a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt))
      .slice(0, 3)
      .map(memoryEntryToContextEntry);
    const sec = buildSection(summaries, 'chapter_summary', '近章摘要', '📖', '#34d399', 'local', sumBudget);
    sections.push(sec);
    if (sec.included.length > 0) {
      promptParts.push('【近章摘要】\n' + sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
    }
    totalTokens += sec.tokenCount;
  }

  // ── 2d. 笔记（剩余预算兜底）────────────────────────────────
  const noteBudget = Math.min(BUDGETS.note, totalBudget - totalTokens);
  if (noteBudget > 0) {
    const notes = localEntries
      .filter(e => e.type === 'note')
      .map(memoryEntryToContextEntry);
    const sec = buildSection(notes, 'note', '笔记', '📝', '#fbbf24', 'local', noteBudget);
    sections.push(sec);
    if (sec.included.length > 0) {
      promptParts.push(sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
    }
    totalTokens += sec.tokenCount;
  }

  // ── 3. 拼接 promptText ────────────────────────────────────
  const promptText = promptParts.length > 0
    ? '【记忆宫殿】\n' + promptParts.join('\n')
    : '';

  return {
    novelTitle: bookId,   // bookId 充当 novelTitle 标识符
    query,
    sections,
    totalTokens,
    totalBudget,
    kgAvailable,
    promptText,
  };
}

// ─────────────────────────────────────────────────────────────
// 同步降级版本（KG 不参与，供无 novelTitle 时使用）
// ─────────────────────────────────────────────────────────────

export function buildContextBundleLocal(
  localEntries: MemoryEntry[],
  query        = '',
  totalBudget  = TOTAL_BUDGET,
): ContextBundle {
  const sections: ContextSection[] = [];
  const promptParts: string[] = [];
  let totalTokens = 0;

  const addSection = (
    type: 'character' | 'world_rule' | 'chapter_summary' | 'note',
    label: string, emoji: string, color: string,
    budgetKey: keyof typeof BUDGETS,
    maxEntries = 999,
  ) => {
    const budget = Math.min(BUDGETS[budgetKey], totalBudget - totalTokens);
    if (budget <= 0) return;
    const entries = localEntries
      .filter(e => e.type === type)
      .slice(0, maxEntries)
      .map(memoryEntryToContextEntry);
    const ranked = (query.trim() && type !== 'chapter_summary')
      ? entries.slice().sort((a, b) => scoreRelevance(b.name, b.summary, query) - scoreRelevance(a.name, a.summary, query))
      : entries;
    const sec = buildSection(ranked, type, label, emoji, color, 'local', budget);
    sections.push(sec);
    if (sec.included.length > 0) {
      promptParts.push(`【${label}】\n` + sec.included.map(e => `${e.name}：${e.summary}`).join('\n'));
    }
    totalTokens += sec.tokenCount;
  };

  addSection('character',       '角色档案', '👤', '#f87171', 'character');
  addSection('world_rule',      '世界设定', '🌍', '#60a5fa', 'world_rule');
  addSection('chapter_summary', '近章摘要', '📖', '#34d399', 'chapter_summary', 3);
  addSection('note',            '笔记',     '📝', '#fbbf24', 'note');

  const promptText = promptParts.length > 0
    ? '【记忆宫殿】\n' + promptParts.join('\n')
    : '';

  return {
    novelTitle: '',
    query,
    sections,
    totalTokens,
    totalBudget,
    kgAvailable: false,
    promptText,
  };
}
