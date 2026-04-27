// ===========================================================
// hooks/useForeshadowings.ts — 伏笔追踪（自动 + 手动合并）
// ===========================================================

import { useState, useEffect, useCallback } from 'react';
import { dbGetAll, dbPut } from '../db/index';
import type { MemoryEntry, PlotHook } from '../memory/types';
import { upsertForeshadowItem, consumeForeshadowItem, getChapterForeshadowSuggestions } from '../api/foreshadow';
import type { ChapterSuggestionsResponse } from '../api/foreshadow';

export interface ForeshadowRecord {
  id: string;
  description: string;
  plantedChapter: number;
  suggestedResolveChapter?: number;
  status: 'planted' | 'resolved';
  resolvedChapter?: number;
  source: 'auto' | 'manual';
}

function parseChapterNumber(input?: string, fallback?: number): number | undefined {
  if (!input?.trim()) return fallback;
  const match = input.match(/\d+/);
  if (!match) return fallback;
  return Math.max(1, Number(match[0]));
}

function toAutoRecord(entry: MemoryEntry): ForeshadowRecord {
  const resolvedMatch = entry.content.match(/\[已回收于第(\d+)章\]/);
  const resolvedChapter = resolvedMatch ? Number(resolvedMatch[1]) : undefined;
  const suggestedResolveChapter = parseChapterNumber(
    entry.description.match(/预计第\s*(\d+)\s*章回收/)?.[0],
  );
  const plantedChapter = parseChapterNumber(entry.description, (
    typeof entry.chapterOrder === 'number' ? entry.chapterOrder + 1 : 1
  )) ?? 1;

  return {
    id: `auto:${entry.id}`,
    description: entry.content.replace(/\n?\[已回收于第\d+章\]/g, '').trim(),
    plantedChapter,
    suggestedResolveChapter,
    status: resolvedChapter ? 'resolved' : 'planted',
    resolvedChapter,
    source: 'auto',
  };
}

function toManualRecord(hook: PlotHook): ForeshadowRecord {
  return {
    id: `manual:${hook.id}`,
    description: hook.description.trim() || hook.title.trim(),
    plantedChapter: parseChapterNumber(hook.chapterCreated, 1) ?? 1,
    status: hook.status === 'resolved' ? 'resolved' : 'planted',
    resolvedChapter: parseChapterNumber(hook.chapterResolved),
    source: 'manual',
  };
}

export function useForeshadowings(bookId: string | undefined) {
  const [items, setItems] = useState<ForeshadowRecord[]>([]);
  const novelId = bookId ?? '';

  const load = useCallback(async () => {
    if (!bookId) {
      setItems([]);
      return;
    }

    try {
      const [memories, hooks] = await Promise.all([
        dbGetAll<MemoryEntry>('memories'),
        dbGetAll<PlotHook>('plot_hooks'),
      ]);

      const autoItems = memories
        .filter(entry => entry.bookId === bookId && entry.type === 'plot_hook')
        .map(toAutoRecord);

      const manualItems = hooks
        .filter(hook => hook.bookId === bookId)
        .map(toManualRecord);

      const next = [...autoItems, ...manualItems].sort((a, b) => (
        a.plantedChapter - b.plantedChapter
        || a.description.localeCompare(b.description, 'zh-CN')
      ));

      setItems(next);
    } catch {
      setItems([]);
    }
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!bookId) {
        if (!cancelled) setItems([]);
        return;
      }

      try {
        const [memories, hooks] = await Promise.all([
          dbGetAll<MemoryEntry>('memories'),
          dbGetAll<PlotHook>('plot_hooks'),
        ]);

        if (cancelled) return;

        const autoItems = memories
          .filter(entry => entry.bookId === bookId && entry.type === 'plot_hook')
          .map(toAutoRecord);

        const manualItems = hooks
          .filter(hook => hook.bookId === bookId)
          .map(toManualRecord);

        const next = [...autoItems, ...manualItems].sort((a, b) => (
          a.plantedChapter - b.plantedChapter
          || a.description.localeCompare(b.description, 'zh-CN')
        ));

        setItems(next);
      } catch {
        if (!cancelled) setItems([]);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const resolve = useCallback(async (id: string, chapterNumber: number) => {
    const [source, rawId] = id.split(':', 2);
    if (!source || !rawId) return;

    let description = '';
    let plantedChapter = 1;

    if (source === 'auto') {
      const all = await dbGetAll<MemoryEntry>('memories');
      const entry = all.find(memory => memory.id === rawId);
      if (!entry) return;

      const marker = `[已回收于第${chapterNumber}章]`;
      const nextContent = entry.content.includes(marker)
        ? entry.content
        : `${entry.content.trim()}\n${marker}`;

      await dbPut('memories', {
        ...entry,
        content: nextContent,
        updatedAt: Date.now(),
      });

      description = entry.content.replace(/\n?\[已回收于第\d+章\]/g, '').trim();
      plantedChapter = typeof entry.chapterOrder === 'number' ? entry.chapterOrder + 1 : 1;
    }

    if (source === 'manual') {
      const all = await dbGetAll<PlotHook>('plot_hooks');
      const hook = all.find(item => item.id === rawId);
      if (!hook) return;

      await dbPut('plot_hooks', {
        ...hook,
        status: 'resolved',
        chapterResolved: `第${chapterNumber}章`,
        updatedAt: Date.now(),
      });

      description = hook.description.trim() || hook.title.trim();
      const m = hook.chapterCreated?.match(/\d+/);
      plantedChapter = m ? Number(m[0]) : 1;
    }

    // Fire-and-forget: 同步至后端台账
    if (novelId && description) {
      upsertForeshadowItem(novelId, {
        entry_id: rawId,
        chapter: plantedChapter,
        hidden_clue: description,
      }).then(() => {
        consumeForeshadowItem(novelId, rawId, chapterNumber).catch(() => {});
      }).catch(() => {});
    }

    await load();
  }, [load, novelId]);

  const getChapterSuggestions = useCallback(
    (chapterNumber: number, outline?: string): Promise<ChapterSuggestionsResponse | null> => {
      if (!novelId) return Promise.resolve(null);
      return getChapterForeshadowSuggestions(novelId, chapterNumber, outline);
    },
    [novelId],
  );

  const pending = items.filter(item => item.status === 'planted');
  const resolved = items.filter(item => item.status === 'resolved');

  return { items, pending, resolved, resolve, reload: load, getChapterSuggestions };
}
