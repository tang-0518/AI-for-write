// =============================================================
// memory/completeChapter.ts — 章节完成多步流程
//
// 纯异步函数，无 React 依赖，方便独立测试和扩展。
// 各步骤独立容错：某步失败只记录错误，不阻断后续步骤。
//
// 步骤：
//   1. 生成章节摘要 → 写入记忆宫殿（chapter_summary）
//   2. 单次 AI 提取 → 同时 upsert 记忆条目与知识图谱
//   3. 保存章节快照
// =============================================================

import { generateChapterSummary, extractChapterAll } from '../api/gemini';
import { saveChapterSummaryEntry, upsertExtractedItems } from './storage';
import { readGraph, upsertEntities, upsertRelations } from '../graph/storage';
import type { Draft } from '../hooks/useBooks';
import type { AppSettings } from '../types';
import type { ExtractedMemoryItem } from '../api/gemini';
import type { NovelEntityType } from '../graph/types';
import type { TensionDimensions } from '../tension/types';

export interface CompleteChapterResult {
  summary:  string;
  entities: ExtractedMemoryItem[];
  graph:    { entityCount: number; relationCount: number };
  errors:   { step: string; message: string }[];
  tension?: TensionDimensions;
}

export type StepKey =
  | 'summary'
  | 'entities'
  | 'graph'
  | 'snapshot'
  | 'tension'
  | 'chapterState'
  | 'weightUpdate';

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
  let tension: TensionDimensions | undefined;
  const chapterNumber = draft.order + 1;

  // ── 步骤 1：生成并保存章节摘要 ───────────────────────────────
  try {
    summary = await generateChapterSummary(draft.title, draft.content, settings);
    await saveChapterSummaryEntry(draft.title, summary, draft.order, bookId);
  } catch (err) {
    errors.push({ step: '摘要生成', message: err instanceof Error ? err.message : String(err) });
  }
  onStepDone?.('summary');

  // ── 步骤 2+3：单次 AI 提取记忆条目 + 图谱 ───────────────────
  try {
    let knownEntityNames: string[] = [];
    try {
      const existingGraph = await readGraph(bookId);
      knownEntityNames = existingGraph.entities.map(entity => entity.name);
    } catch {
      // 图谱读取失败时降级为无已知实体提示
    }

    const extracted = await extractChapterAll(
      draft.title,
      draft.content,
      settings,
      knownEntityNames,
    );

    entities = extracted.memories;
    if (entities.length > 0) await upsertExtractedItems(entities, bookId);

    const graphEntities = extracted.graphEntities.map(entity => ({
      name: entity.name.trim(),
      type: entity.type as NovelEntityType,
      attributes: entity.attributes ?? {},
      observations: entity.observations ?? [],
      firstChapter: draft.order,
      tags: entity.tags ?? [],
      source: 'auto_extract' as const,
    }));

    const graphRelations = extracted.graphRelations.map(relation => ({
      from: relation.from.trim(),
      to: relation.to.trim(),
      relationType: relation.relationType.trim(),
      weight: relation.weight ?? 0.7,
      notes: relation.notes?.trim() || undefined,
      chapter: draft.order,
      source: 'auto_extract' as const,
    }));

    await upsertEntities(bookId, graphEntities);
    await upsertRelations(bookId, graphRelations);
    graph = { entityCount: graphEntities.length, relationCount: graphRelations.length };
  } catch (err) {
    errors.push({ step: '实体&图谱提取', message: err instanceof Error ? err.message : String(err) });
  } finally {
    onStepDone?.('entities');
    onStepDone?.('graph');
  }

  // ── 步骤 4：保存快照 ─────────────────────────────────────────
  try {
    await saveSnapshot(draft.content, draft.title, '完成章节');
  } catch (err) {
    errors.push({ step: '快照保存', message: err instanceof Error ? err.message : String(err) });
  }
  onStepDone?.('snapshot');

  // ── 步骤 5：张力评分（异步，不阻断主流程）─────────────────────
  try {
    const { scoreChapterTension } = await import('../tension/scorer');
    tension = await scoreChapterTension(draft.content, chapterNumber, settings) ?? undefined;
    if (tension) onStepDone?.('tension');
  } catch {
    // 评分失败不影响主流程
  }

  // ── 步骤 6：章节状态提取与持久化 ─────────────────────────────
  try {
    const { extractChapterState } = await import('../chapterState/extractor');
    const { persistChapterState } = await import('../chapterState/storage');
    const state = await extractChapterState(draft.content, chapterNumber, settings);
    if (state) {
      await persistChapterState(state, bookId, draft.order);
      onStepDone?.('chapterState');
    }
  } catch {
    // 状态提取失败不影响主流程
  }

  // ── 步骤 7：图谱关系权重更新（G-2）────────────────────────────
  try {
    const { dbGetAll, dbPut } = await import('../db/index');
    type Rel = import('../graph/types').NovelRelation;

    const bookRels = (await dbGetAll<Rel>('graph_relations'))
      .filter(relation => relation.bookId === bookId);

    const activeKeys = new Set(
      bookRels
        .filter(relation => relation.chapter === draft.order)
        .map(relation => `${relation.from}|${relation.to}|${relation.relationType}`),
    );

    for (const relation of bookRels) {
      const key = `${relation.from}|${relation.to}|${relation.relationType}`;
      const appeared = activeKeys.has(key);
      const weight = relation.weight ?? 0.5;
      const newWeight = appeared
        ? Math.min(1.0, weight + 0.05)
        : Math.max(0.1, weight - 0.01);

      if (Math.abs(newWeight - weight) > 0.001) {
        await dbPut('graph_relations', { ...relation, weight: newWeight });
      }
    }
  } catch {
    // 权重更新失败不影响主流程
  } finally {
    onStepDone?.('weightUpdate');
  }

  return { summary, entities, graph, errors, tension };
}
