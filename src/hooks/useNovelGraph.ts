// =============================================================
// hooks/useNovelGraph.ts — 知识图谱 React Hook（IndexedDB 版）
//
// 替代原 MCP server HTTP 版本，直接读写本地 IndexedDB。
// 参数从 novelTitle 改为 bookId。
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import { readGraph, upsertEntity, upsertRelation, deleteEntity, getGraphStats } from '../graph/storage';
import type { NovelGraph, NovelEntity, NovelEntityType } from '../graph/types';

export type { NovelEntityType, NovelEntity, NovelRelation, NovelGraph } from '../graph/types';

export interface GraphStats {
  bookId:        string;
  entityCount:   number;
  relationCount: number;
  byType:        Record<string, number>;
}

export function useNovelGraph(bookId: string | null) {
  const [graph,   setGraph]   = useState<NovelGraph | null>(null);
  const [stats,   setStats]   = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    if (!bookId) { setGraph(null); setStats(null); return; }
    setLoading(true);
    setError(null);
    try {
      const [g, s] = await Promise.all([readGraph(bookId), getGraphStats(bookId)]);
      setGraph(g);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载图谱失败');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const addEntity = useCallback(async (
    name:         string,
    type:         NovelEntityType,
    observations: string[] = [],
    attributes:   Record<string, string> = {},
    tags:         string[] = [],
  ): Promise<NovelEntity | null> => {
    if (!bookId) return null;
    const entity = await upsertEntity(bookId, { name, type, observations, attributes, tags, source: 'manual' });
    setGraph(prev => {
      if (!prev) return prev;
      const idx = prev.entities.findIndex(e => e.id === entity.id);
      const entities = idx >= 0
        ? prev.entities.map((e, i) => i === idx ? entity : e)
        : [...prev.entities, entity];
      return { ...prev, entities };
    });
    return entity;
  }, [bookId]);

  const addRelation = useCallback(async (
    from:         string,
    to:           string,
    relationType: string,
    weight        = 0.7,
    notes?:       string,
  ): Promise<void> => {
    if (!bookId) return;
    await upsertRelation(bookId, { from, to, relationType, weight, notes, source: 'manual' });
    await loadGraph();
  }, [bookId, loadGraph]);

  const removeEntity = useCallback(async (name: string): Promise<void> => {
    if (!bookId) return;
    await deleteEntity(bookId, name);
    setGraph(prev =>
      prev
        ? {
            ...prev,
            entities:  prev.entities.filter(e => e.name !== name),
            relations: prev.relations.filter(r => r.from !== name && r.to !== name),
          }
        : prev,
    );
  }, [bookId]);

  const entitiesByType = graph
    ? graph.entities.reduce((acc, e) => {
        if (!acc[e.type]) acc[e.type] = [];
        acc[e.type].push(e);
        return acc;
      }, {} as Record<NovelEntityType, NovelEntity[]>)
    : null;

  return {
    graph,
    stats,
    loading,
    error,
    /** 兼容旧调用方：IndexedDB 始终可用 */
    apiAvailable: true as const,
    entitiesByType,
    loadGraph,
    addEntity,
    addRelation,
    removeEntity,
  };
}
