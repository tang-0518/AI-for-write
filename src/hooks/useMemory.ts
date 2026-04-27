// =============================================================
// hooks/useMemory.ts — 记忆宫殿 React Hook
//
// 【职责】
//   管理"记忆宫殿"的状态和手动 CRUD。
//   业务逻辑（去重 upsert、章节摘要存储）已移入 memory/storage.ts。
//
// 【三层记忆架构】
//
//   Layer 0  工作记忆（contextCompression.ts）— 不在此管理
//   Layer 1  章节摘要  chapter_summary        — 完成章节时由 completeChapter() 写入
//   Layer 2  书级实体  character / world_rule  — 自动提取 + 手动修正
//            用户笔记  note                    — 纯手动
//
// 【数据流向】
//
//   自动提取（低频）：
//     acceptContinuation → extractEntitiesFromAccepted() → upsertExtractedItems() → refresh()
//
//   完成章节：
//     ChapterCompleteModal → completeChapter() → storage 直接写 → refresh()
//
//   手动操作：
//     MemoryPanel → useMemory.add/update/remove()
//
//   注入 Prompt：
//     useEditor → resolveMemoryContext() → buildRelevantMemoryContext()
//
// 【被哪些文件使用】
//   App.tsx — 实例化，将返回值传给 useEditor 和 MemoryPanel
// =============================================================

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  loadMemoriesAsync,
  upsertMemoryAsync,
  deleteMemoryAsync,
  upsertExtractedItems,
} from '../memory/storage';
import type { MemoryEntry, MemoryType } from '../memory/types';
import { clearGenerationCache } from '../api/cache';
import type { ExtractedMemoryItem } from '../api/gemini';
import { buildContextBundle, buildContextBundleLocal } from '../api/memoryService';
import type { ContextBundle } from '../api/memoryService';

export function useMemory(activeBookId?: string) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [bundleSnapshot, setBundleSnapshot] = useState<ContextBundle | null>(null);

  const bundleRequestSeqRef = useRef(0);
  const lastBundleArgsRef = useRef<{ query: string; tokenBudget?: number }>({ query: '', tokenBudget: undefined });

  // ── 从 IndexedDB 全量加载 ─────────────────────────────────
  useEffect(() => {
    loadMemoriesAsync()
      .then(data => { setEntries(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  // ── 外部写入后刷新（ChapterCompleteModal 完成后调用）────────
  const refresh = useCallback(async () => {
    const data = await loadMemoriesAsync();
    setEntries(data);
    clearGenerationCache();
  }, []);

  // ── 按当前书目过滤 ────────────────────────────────────────
  const bookEntries = useMemo(
    () => entries.filter(e => !e.bookId || e.bookId === activeBookId),
    [entries, activeBookId],
  );

  const characters = useMemo(
    () => bookEntries.filter(e => e.type === 'character'),
    [bookEntries],
  );

  const worldRules = useMemo(
    () => bookEntries.filter(e => e.type === 'world_rule'),
    [bookEntries],
  );

  const chapterSummaries = useMemo(
    () => bookEntries
      .filter(e => e.type === 'chapter_summary')
      .sort((a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt)),
    [bookEntries],
  );

  const notes = useMemo(
    () => bookEntries.filter(e => e.type === 'note'),
    [bookEntries],
  );

  // ── 手动 CRUD ─────────────────────────────────────────────

  const add = useCallback(async (entry: {
    name: string;
    description?: string;
    type: MemoryType;
    content: string;
    bookId?: string;
    autoExtracted?: boolean;
    chapterOrder?: number;
  }): Promise<MemoryEntry> => {
    const saved = await upsertMemoryAsync({
      description: '',
      ...entry,
      bookId: entry.bookId ?? activeBookId,
    });
    setEntries(await loadMemoriesAsync());
    clearGenerationCache();
    return saved;
  }, [activeBookId]);

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

  // ── 接受 AI 续写后的后台自动提取 ─────────────────────────
  // 触发时机：用户接受续写片段（acceptContinuation）
  const upsertExtracted = useCallback(async (items: ExtractedMemoryItem[]): Promise<void> => {
    if (items.length === 0 || !activeBookId) return;
    await upsertExtractedItems(items, activeBookId);
    setEntries(await loadMemoriesAsync());
    clearGenerationCache();
  }, [activeBookId]);

  // ── 构建 Prompt 上下文 ────────────────────────────────────

  const buildBundleCore = useCallback(
    (query = '', tokenBudget?: number): Promise<ContextBundle> => {
      const currentBookEntries = entries.filter(e => !e.bookId || e.bookId === activeBookId);
      if (activeBookId) {
        return buildContextBundle(activeBookId, currentBookEntries, query, tokenBudget);
      }
      return Promise.resolve(buildContextBundleLocal(currentBookEntries, query, tokenBudget));
    },
    [activeBookId, entries],
  );

  const applyBundleSnapshot = useCallback(
    async (query = '', tokenBudget?: number): Promise<ContextBundle> => {
      lastBundleArgsRef.current = { query, tokenBudget };
      const requestId = ++bundleRequestSeqRef.current;
      const bundle = await buildBundleCore(query, tokenBudget);
      if (requestId === bundleRequestSeqRef.current) {
        setBundleSnapshot(bundle);
      }
      return bundle;
    },
    [buildBundleCore],
  );

  useEffect(() => {
    let cancelled = false;
    const { query, tokenBudget } = lastBundleArgsRef.current;
    const requestId = ++bundleRequestSeqRef.current;
    buildBundleCore(query, tokenBudget)
      .then((bundle) => {
        if (!cancelled && requestId === bundleRequestSeqRef.current) {
          setBundleSnapshot(bundle);
        }
      })
      .catch(() => {
        if (!cancelled && requestId === bundleRequestSeqRef.current) {
          setBundleSnapshot(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [buildBundleCore]);

  const memoryContext = bundleSnapshot?.promptText ?? '';

  const buildContextForQuery = useCallback(async (query: string, tokenBudget?: number) => {
    const bundle = await applyBundleSnapshot(query, tokenBudget);
    return bundle.promptText;
  }, [applyBundleSnapshot]);

  const buildBundle = useCallback(
    (query = '', tokenBudget?: number): Promise<ContextBundle> => applyBundleSnapshot(query, tokenBudget),
    [applyBundleSnapshot],
  );

  return {
    entries: bookEntries,
    characters,
    worldRules,
    chapterSummaries,
    notes,
    loaded,
    add,
    update,
    remove,
    refresh,
    upsertExtracted,
    memoryContext,
    buildContextForQuery,
    buildBundle,
    bundleSnapshot,
  };
}
