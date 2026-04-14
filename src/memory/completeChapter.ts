// =============================================================
// memory/completeChapter.ts — 章节完成四步流程
//
// 纯异步函数，无 React 依赖，方便独立测试和扩展。
// 各步骤独立容错：某步失败只记录错误，不阻断后续步骤。
//
// 步骤：
//   1. 生成章节摘要 → 写入记忆宫殿（chapter_summary）
//   2. 提取角色/世界设定 → upsert 到记忆宫殿（character / world_rule）
//   3. 提取知识图谱实体/关系 → upsert 到 IndexedDB（graph_entities / graph_relations）
//   4. 保存章节快照
// =============================================================

import { generateChapterSummary, extractChapterEntities } from '../api/gemini';
import { saveChapterSummaryEntry, upsertExtractedItems } from './storage';
import { extractAndSaveGraph } from '../graph/extractor';
import type { Draft } from '../hooks/useBooks';
import type { AppSettings } from '../types';
import type { ExtractedMemoryItem } from '../api/gemini';

export interface CompleteChapterResult {
  summary:  string;
  entities: ExtractedMemoryItem[];
  graph:    { entityCount: number; relationCount: number };
  errors:   { step: string; message: string }[];
}

export type StepKey = 'summary' | 'entities' | 'graph' | 'snapshot';

export async function completeChapter(
  draft: Draft,
  settings: AppSettings,
  bookId: string,
  saveSnapshot: (content: string, title: string, label: string) => Promise<void>,
  onStepDone?: (step: StepKey) => void,
): Promise<CompleteChapterResult> {
  const errors: { step: string; message: string }[] = [];
  let summary = '';
  let entities: ExtractedMemoryItem[] = [];
  let graph = { entityCount: 0, relationCount: 0 };

  // ── 步骤 1：生成并保存章节摘要 ───────────────────────────────
  try {
    summary = await generateChapterSummary(draft.title, draft.content, settings);
    await saveChapterSummaryEntry(draft.title, summary, draft.order, bookId);
  } catch (err) {
    errors.push({ step: '摘要生成', message: err instanceof Error ? err.message : String(err) });
  }
  onStepDone?.('summary');

  // ── 步骤 2：提取实体并 upsert 到记忆宫殿 ─────────────────────
  try {
    entities = await extractChapterEntities(draft.title, draft.content, settings);
    if (entities.length > 0) await upsertExtractedItems(entities, bookId);
  } catch (err) {
    errors.push({ step: '实体提取', message: err instanceof Error ? err.message : String(err) });
  }
  onStepDone?.('entities');

  // ── 步骤 3：提取知识图谱 ──────────────────────────────────────
  try {
    graph = await extractAndSaveGraph(draft.title, draft.content, bookId, settings);
  } catch (err) {
    errors.push({ step: '图谱提取', message: err instanceof Error ? err.message : String(err) });
  }
  onStepDone?.('graph');

  // ── 步骤 4：保存快照 ─────────────────────────────────────────
  try {
    await saveSnapshot(draft.content, draft.title, '完成章节');
  } catch (err) {
    errors.push({ step: '快照保存', message: err instanceof Error ? err.message : String(err) });
  }
  onStepDone?.('snapshot');

  return { summary, entities, graph, errors };
}
