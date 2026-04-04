// =============================================================
// hooks/useMemory.ts — 记忆系统 React Hook（IndexedDB 持久化）
// =============================================================

import { useState, useCallback, useEffect } from 'react';
import {
  loadMemoriesAsync,
  upsertMemoryAsync,
  deleteMemoryAsync,
  buildMemoryContext,
  buildRelevantMemoryContext,
} from '../memory/storage';
import type { MemoryEntry, MemoryType } from '../memory/types';
import { clearGenerationCache } from '../api/cache';

export function useMemory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 初始化：从 IndexedDB 加载
  useEffect(() => {
    loadMemoriesAsync()
      .then(data => { setEntries(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const add = useCallback(async (entry: {
    name: string;
    description: string;
    type: MemoryType;
    content: string;
  }): Promise<MemoryEntry> => {
    const saved = await upsertMemoryAsync(entry);
    setEntries(await loadMemoriesAsync());
    clearGenerationCache(); // 记忆变更 → 旧缓存失效
    return saved;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Omit<MemoryEntry, 'id' | 'updatedAt'>>) => {
    const current = entries.find(e => e.id === id);
    if (!current) return;
    await upsertMemoryAsync({ ...current, ...patch, id });
    setEntries(await loadMemoriesAsync());
    clearGenerationCache();
  }, [entries]);

  const remove = useCallback(async (id: string) => {
    await deleteMemoryAsync(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    clearGenerationCache();
  }, []);

  const memoryContext = buildMemoryContext(entries);

  const buildContextForQuery = useCallback((query: string, tokenBudget?: number) => {
    return buildRelevantMemoryContext(entries, query, tokenBudget).context;
  }, [entries]);

  return { entries, loaded, add, update, remove, memoryContext, buildContextForQuery };
}
