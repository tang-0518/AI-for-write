// =============================================================
// graph/storage.ts — 知识图谱 IndexedDB CRUD
//
// 实体合并规则：bookId + name + type 完全匹配视为同一条目
// 关系幂等规则：bookId + from + to + relationType 完全匹配
// =============================================================

import type { NovelEntity, NovelRelation, NovelGraph, NovelEntityType } from './types';
import { dbGetAll, dbPut, dbDelete } from '../db/index';

const MAX_OBSERVATIONS = 15;

function makeEntityKey(
  bookId: string,
  entity: Pick<NovelEntity, 'name' | 'type'>,
): string {
  return `${bookId}::${entity.type}::${entity.name.trim()}`;
}

function makeRelationKey(
  bookId: string,
  relation: Pick<NovelRelation, 'from' | 'to' | 'relationType'>,
): string {
  return `${bookId}::${relation.from}::${relation.to}::${relation.relationType}`;
}

function mergeObservations(existing: string[], incoming: string[]): string[] {
  const merged = Array.from(new Set([...existing, ...incoming].map(line => line.trim()).filter(Boolean)));
  return merged.length > MAX_OBSERVATIONS ? merged.slice(-MAX_OBSERVATIONS) : merged;
}

function mergeEntityRecord(
  existing: NovelEntity,
  entity: Omit<NovelEntity, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
  now: number,
): NovelEntity {
  return {
    ...existing,
    name: entity.name.trim(),
    attributes: { ...existing.attributes, ...(entity.attributes ?? {}) },
    observations: mergeObservations(existing.observations, entity.observations ?? []),
    firstChapter: existing.firstChapter ?? entity.firstChapter,
    tags: Array.from(new Set([...existing.tags, ...(entity.tags ?? [])].map(tag => tag.trim()).filter(Boolean))),
    source: entity.source,
    updatedAt: now,
  };
}

function createEntityRecord(
  bookId: string,
  entity: Omit<NovelEntity, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
  now: number,
): NovelEntity {
  return {
    id: `ge_${now}_${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    name: entity.name.trim(),
    type: entity.type,
    attributes: entity.attributes ?? {},
    observations: mergeObservations([], entity.observations ?? []),
    firstChapter: entity.firstChapter,
    tags: Array.from(new Set((entity.tags ?? []).map(tag => tag.trim()).filter(Boolean))),
    source: entity.source,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeRelationRecord(
  existing: NovelRelation,
  relation: Omit<NovelRelation, 'id' | 'bookId' | 'createdAt'>,
): NovelRelation {
  return {
    ...existing,
    weight: relation.weight ?? existing.weight,
    notes: relation.notes ?? existing.notes,
    chapter: relation.chapter ?? existing.chapter,
    source: relation.source,
  };
}

function createRelationRecord(
  bookId: string,
  relation: Omit<NovelRelation, 'id' | 'bookId' | 'createdAt'>,
  now: number,
): NovelRelation {
  return {
    id: `gr_${now}_${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    from: relation.from,
    to: relation.to,
    relationType: relation.relationType,
    weight: relation.weight ?? 0.7,
    notes: relation.notes,
    chapter: relation.chapter,
    source: relation.source,
    createdAt: now,
  };
}

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
  const existing = all.find(e => makeEntityKey(bookId, e) === makeEntityKey(bookId, entity));

  if (existing) {
    const updated = mergeEntityRecord(existing, entity, now);
    await dbPut('graph_entities', updated);
    return updated;
  }

  const created = createEntityRecord(bookId, entity, now);
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
  const existing = all.find(r => makeRelationKey(bookId, r) === makeRelationKey(bookId, relation));

  if (existing) {
    const updated = mergeRelationRecord(existing, relation);
    await dbPut('graph_relations', updated);
    return updated;
  }

  const created = createRelationRecord(bookId, relation, now);
  await dbPut('graph_relations', created);
  return created;
}

// ── 批量 upsert ───────────────────────────────────────────────
export async function upsertEntities(
  bookId: string,
  entities: Array<Omit<NovelEntity, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  if (entities.length === 0) return;

  const all = await dbGetAll<NovelEntity>('graph_entities');
  const entityMap = new Map(
    all
      .filter(entity => entity.bookId === bookId)
      .map(entity => [makeEntityKey(bookId, entity), entity] as const),
  );

  for (const entity of entities) {
    const now = Date.now();
    const key = makeEntityKey(bookId, entity);
    const existing = entityMap.get(key);
    const next = existing
      ? mergeEntityRecord(existing, entity, now)
      : createEntityRecord(bookId, entity, now);

    await dbPut('graph_entities', next);
    entityMap.set(key, next);
  }
}

export async function upsertRelations(
  bookId: string,
  relations: Array<Omit<NovelRelation, 'id' | 'bookId' | 'createdAt'>>,
): Promise<void> {
  if (relations.length === 0) return;

  const all = await dbGetAll<NovelRelation>('graph_relations');
  const relationMap = new Map(
    all
      .filter(relation => relation.bookId === bookId)
      .map(relation => [makeRelationKey(bookId, relation), relation] as const),
  );

  for (const relation of relations) {
    const now = Date.now();
    const key = makeRelationKey(bookId, relation);
    const existing = relationMap.get(key);
    const next = existing
      ? mergeRelationRecord(existing, relation)
      : createRelationRecord(bookId, relation, now);

    await dbPut('graph_relations', next);
    relationMap.set(key, next);
  }
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
