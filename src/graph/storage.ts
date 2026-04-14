// =============================================================
// graph/storage.ts — 知识图谱 IndexedDB CRUD
//
// 实体合并规则：bookId + name + type 完全匹配视为同一条目
// 关系幂等规则：bookId + from + to + relationType 完全匹配
// =============================================================

import type { NovelEntity, NovelRelation, NovelGraph, NovelEntityType } from './types';
import { dbGetAll, dbPut, dbDelete } from '../db/index';

// ── 读取书目图谱 ──────────────────────────────────────────────
export async function readGraph(bookId: string): Promise<NovelGraph> {
  const [entities, relations] = await Promise.all([
    dbGetAll<NovelEntity>('graph_entities'),
    dbGetAll<NovelRelation>('graph_relations'),
  ]);
  return {
    bookId,
    entities:  entities.filter(e => e.bookId === bookId),
    relations: relations.filter(r => r.bookId === bookId),
  };
}

// ── upsert 实体（合并 observations / attributes / tags） ──────
export async function upsertEntity(
  bookId: string,
  entity: Omit<NovelEntity, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
): Promise<NovelEntity> {
  const all = await dbGetAll<NovelEntity>('graph_entities');
  const now = Date.now();
  const existing = all.find(
    e => e.bookId === bookId
      && e.name.trim() === entity.name.trim()
      && e.type === entity.type,
  );

  if (existing) {
    // 合并 observations（去重追加），合并 attributes，合并 tags（去重）
    const mergedObs = Array.from(new Set([...existing.observations, ...entity.observations]));
    const mergedAttrs = { ...existing.attributes, ...entity.attributes };
    const mergedTags  = Array.from(new Set([...existing.tags, ...entity.tags]));
    const updated: NovelEntity = {
      ...existing,
      attributes:   mergedAttrs,
      observations: mergedObs,
      tags:         mergedTags,
      updatedAt:    now,
    };
    await dbPut('graph_entities', updated);
    return updated;
  }

  const created: NovelEntity = {
    id:        `ge_${now}_${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    name:      entity.name.trim(),
    type:      entity.type,
    attributes:   entity.attributes   ?? {},
    observations: entity.observations ?? [],
    firstChapter: entity.firstChapter,
    tags:         entity.tags         ?? [],
    source:    entity.source,
    createdAt: now,
    updatedAt: now,
  };
  await dbPut('graph_entities', created);
  return created;
}

// ── upsert 关系（幂等） ───────────────────────────────────────
export async function upsertRelation(
  bookId: string,
  relation: Omit<NovelRelation, 'id' | 'bookId' | 'createdAt'>,
): Promise<NovelRelation> {
  const all = await dbGetAll<NovelRelation>('graph_relations');
  const now = Date.now();
  const existing = all.find(
    r => r.bookId === bookId
      && r.from === relation.from
      && r.to   === relation.to
      && r.relationType === relation.relationType,
  );

  if (existing) {
    const updated: NovelRelation = {
      ...existing,
      weight: relation.weight ?? existing.weight,
      notes:  relation.notes  ?? existing.notes,
    };
    await dbPut('graph_relations', updated);
    return updated;
  }

  const created: NovelRelation = {
    id:           `gr_${now}_${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    from:         relation.from,
    to:           relation.to,
    relationType: relation.relationType,
    weight:       relation.weight ?? 0.7,
    notes:        relation.notes,
    chapter:      relation.chapter,
    source:       relation.source,
    createdAt:    now,
  };
  await dbPut('graph_relations', created);
  return created;
}

// ── 批量 upsert ───────────────────────────────────────────────
export async function upsertEntities(
  bookId: string,
  entities: Array<Omit<NovelEntity, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  for (const e of entities) await upsertEntity(bookId, e);
}

export async function upsertRelations(
  bookId: string,
  relations: Array<Omit<NovelRelation, 'id' | 'bookId' | 'createdAt'>>,
): Promise<void> {
  for (const r of relations) await upsertRelation(bookId, r);
}

// ── 删除实体及相关关系 ────────────────────────────────────────
export async function deleteEntity(bookId: string, name: string): Promise<void> {
  const [entities, relations] = await Promise.all([
    dbGetAll<NovelEntity>('graph_entities'),
    dbGetAll<NovelRelation>('graph_relations'),
  ]);
  const toDeleteEntities = entities.filter(e => e.bookId === bookId && e.name === name);
  const toDeleteRelations = relations.filter(r => r.bookId === bookId && (r.from === name || r.to === name));
  await Promise.all([
    ...toDeleteEntities.map(e => dbDelete('graph_entities', e.id)),
    ...toDeleteRelations.map(r => dbDelete('graph_relations', r.id)),
  ]);
}

// ── 统计 ─────────────────────────────────────────────────────
export async function getGraphStats(bookId: string) {
  const graph = await readGraph(bookId);
  const byType: Record<string, number> = {};
  for (const e of graph.entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  return {
    bookId,
    entityCount:   graph.entities.length,
    relationCount: graph.relations.length,
    byType,
  };
}

// ── 按类型筛选 ───────────────────────────────────────────────
export function filterByType(entities: NovelEntity[], type: NovelEntityType): NovelEntity[] {
  return entities.filter(e => e.type === type);
}
