// =============================================================
// hooks/useMemory.ts — 记忆系统 React Hook（IndexedDB 持久化）
// =============================================================

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  loadMemoriesAsync,
  upsertMemoryAsync,
  deleteMemoryAsync,
  buildMemoryContext,
  buildRelevantMemoryContext,
} from '../memory/storage';
import type { MemoryEntry, MemoryType, TruthFileType } from '../memory/types';
import { TRUTH_FILE_META } from '../memory/types';
import { clearGenerationCache } from '../api/cache';

export function useMemory(activeBookId?: string) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ref 用于 saveTruthFiles 避免因 entries 变化重建函数引发子组件重渲染
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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
    bookId?: string;
    truthFileType?: TruthFileType;
  }): Promise<MemoryEntry> => {
    const saved = await upsertMemoryAsync(entry);
    setEntries(await loadMemoriesAsync());
    clearGenerationCache();
    return saved;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Omit<MemoryEntry, 'id' | 'updatedAt'>>) => {
    // 读取时用 ref，避免竞态时用到陈旧的 entries state
    const current = entriesRef.current.find(e => e.id === id);
    if (!current) return;
    await upsertMemoryAsync({ ...current, ...patch, id });
    setEntries(await loadMemoriesAsync());
    clearGenerationCache();
  }, []); // 不依赖 entries，通过 ref 访问

  const remove = useCallback(async (id: string) => {
    await deleteMemoryAsync(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    clearGenerationCache();
  }, []);

  // 用 useMemo 避免每次 render 重复 filter
  const nonTruthEntries = useMemo(
    () => entries.filter(e => !e.truthFileType),
    [entries]
  );

  const truthFiles = useMemo(
    () => entries.filter(
      e => e.truthFileType && (!activeBookId || !e.bookId || e.bookId === activeBookId)
    ),
    [entries, activeBookId]
  );

  // saveTruthFiles 不依赖 entries（通过 ref），避免频繁重建引用
  const saveTruthFiles = useCallback(async (
    files: Array<{ type: TruthFileType; content: string }>
  ) => {
    const current = entriesRef.current;
    for (const file of files) {
      const existing = current.find(
        e => e.truthFileType === file.type && (!activeBookId || !e.bookId || e.bookId === activeBookId)
      );
      const meta = TRUTH_FILE_META[file.type];
      if (existing) {
        await upsertMemoryAsync({ ...existing, content: file.content, id: existing.id });
      } else {
        await upsertMemoryAsync({
          name: meta.name,
          description: meta.description,
          type: 'project',
          content: file.content,
          bookId: activeBookId,
          truthFileType: file.type,
        });
      }
    }
    setEntries(await loadMemoriesAsync());
    clearGenerationCache();
  }, [activeBookId]); // 移除 entries 依赖，改用 ref

  const memoryContext = useMemo(
    () => buildMemoryContext(nonTruthEntries),
    [nonTruthEntries]
  );

  const buildContextForQuery = useCallback((query: string, tokenBudget?: number) => {
    return buildRelevantMemoryContext(entriesRef.current.filter(e => !e.truthFileType), query, tokenBudget).context;
  }, []); // 通过 ref 访问，不需要依赖 entries

  return {
    entries: nonTruthEntries,
    truthFiles,
    loaded,
    add,
    update,
    remove,
    saveTruthFiles,
    memoryContext,
    buildContextForQuery,
  };
}
