// =============================================================
// hooks/usePlotHooks.ts — 情节钩子管理 Hook（源自 InkOS plot-hooks 架构）
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import type { PlotHook, PlotHookStatus, PlotHookPriority } from '../memory/types';
import { dbGetAll, dbPut, dbDelete } from '../db/index';

// Fields the caller provides when creating a hook (bookId/id/timestamps handled internally)
export type CreateInput = Omit<PlotHook, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>;
type UpdateInput = Partial<Omit<PlotHook, 'id' | 'bookId' | 'createdAt'>>;

export function usePlotHooks(bookId: string | undefined) {
  const [hooks, setHooks] = useState<PlotHook[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 加载当前书目的情节钩子
  useEffect(() => {
    let cancelled = false;
    const loadHooks = async () => {
      if (!bookId) {
        if (!cancelled) {
          setHooks([]);
          setLoaded(true);
        }
        return;
      }
      if (!cancelled) setLoaded(false);
      try {
        const all = await dbGetAll<PlotHook>('plot_hooks');
        if (!cancelled) {
          setHooks(all.filter(h => h.bookId === bookId).sort((a, b) => b.createdAt - a.createdAt));
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };
    void loadHooks();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const add = useCallback(async (input: CreateInput): Promise<void> => {
    if (!bookId) return;
    const now = Date.now();
    const hook: PlotHook = {
      id: `hook_${now}_${Math.random().toString(36).slice(2, 8)}`,
      bookId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      chapterCreated: input.chapterCreated,
      createdAt: now,
      updatedAt: now,
    };
    await dbPut('plot_hooks', hook);
    setHooks(prev => [hook, ...prev]);
  }, [bookId]);

  const update = useCallback(async (id: string, changes: UpdateInput): Promise<void> => {
    setHooks(prev => {
      const next = prev.map(h => h.id === id ? { ...h, ...changes, updatedAt: Date.now() } : h);
      const updated = next.find(h => h.id === id);
      if (updated) dbPut('plot_hooks', updated).catch(() => {});
      return next;
    });
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    await dbDelete('plot_hooks', id);
    setHooks(prev => prev.filter(h => h.id !== id));
  }, []);

  const resolve = useCallback((id: string, chapterResolved?: string) => {
    return update(id, { status: 'resolved' as PlotHookStatus, chapterResolved });
  }, [update]);

  const defer = useCallback((id: string) => {
    return update(id, { status: 'deferred' as PlotHookStatus });
  }, [update]);

  const reopen = useCallback((id: string) => {
    return update(id, { status: 'pending' as PlotHookStatus });
  }, [update]);

  // 统计：各状态数量
  const counts = {
    pending:  hooks.filter(h => h.status === 'pending').length,
    resolved: hooks.filter(h => h.status === 'resolved').length,
    deferred: hooks.filter(h => h.status === 'deferred').length,
  };

  // 高优先级未解决钩子数（用于工具栏徽章）
  const urgentCount = hooks.filter(h => h.status === 'pending' && h.priority === 'high').length;

  return { hooks, loaded, counts, urgentCount, add, update, remove, resolve, defer, reopen };
}

export type { PlotHook, PlotHookStatus, PlotHookPriority };
