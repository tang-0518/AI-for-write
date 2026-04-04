// =============================================================
// hooks/useDrafts.ts — 多章节草稿管理 Hook（IndexedDB 持久化）
// =============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_DRAFT_CONTEXT_STATE } from '../types';
import type { DraftContextState } from '../types';
import { dbGetAll, dbPut, dbDelete, dbReplaceAll, kvGet, kvSet } from '../db/index';

export interface Draft {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  contextState: DraftContextState;
}

function newDraft(content = ''): Draft {
  return {
    id: Date.now().toString(),
    title: '新章节',
    content,
    updatedAt: Date.now(),
    contextState: { ...DEFAULT_DRAFT_CONTEXT_STATE },
  };
}

function normalizeDraft(draft: Draft): Draft {
  return {
    ...draft,
    contextState: {
      ...DEFAULT_DRAFT_CONTEXT_STATE,
      ...(draft as Partial<Draft>).contextState,
    },
  };
}

// 防抖写单条草稿内容（避免流式输出期间每个字符都触发 IDB 写入）
function useDebounceRef(fn: (id: string, content: string) => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((id: string, content: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(id, content), delay);
  }, [fn, delay]);
}

export function useDrafts() {
  const [drafts, setDraftsState] = useState<Draft[]>([]);
  const [activeDraftId, setActiveDraftIdState] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  // ── 初始化：从 IndexedDB 加载 ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [allDrafts, order, activeId] = await Promise.all([
          dbGetAll<Draft>('drafts'),
          kvGet<string[]>('draft-order'),
          kvGet<string>('active-draft-id'),
        ]);

        let ordered: Draft[];
        if (order && order.length > 0) {
          const byId = new Map(allDrafts.map(d => [d.id, d]));
          ordered = order.map(id => byId.get(id)).filter(Boolean) as Draft[];
          // 补上 order 中不存在但 IDB 有的草稿（容错）
          const inOrder = new Set(order);
          for (const d of allDrafts) {
            if (!inOrder.has(d.id)) ordered.push(d);
          }
        } else {
          ordered = allDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
        }

        if (ordered.length === 0) {
          const fresh = newDraft();
          ordered = [fresh];
          await dbPut('drafts', fresh);
          await kvSet('draft-order', [fresh.id]);
          await kvSet('active-draft-id', fresh.id);
          setDraftsState(ordered);
          setActiveDraftIdState(fresh.id);
        } else {
          setDraftsState(ordered.map(normalizeDraft));
          const validActive = ordered.find(d => d.id === activeId);
          setActiveDraftIdState(validActive ? activeId! : ordered[0].id);
        }
      } catch (err) {
        console.error('[useDrafts] 加载失败', err);
        const fresh = newDraft();
        setDraftsState([fresh]);
        setActiveDraftIdState(fresh.id);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 内部 setter 同时持久化 order
  const setDrafts = useCallback(async (updater: (prev: Draft[]) => Draft[]) => {
    setDraftsState(prev => {
      const next = updater(prev);
      // 异步持久化 order（不阻塞渲染）
      kvSet('draft-order', next.map(d => d.id)).catch(() => {});
      return next;
    });
  }, []);

  const setActiveDraftId = useCallback((id: string) => {
    setActiveDraftIdState(id);
    kvSet('active-draft-id', id).catch(() => {});
  }, []);

  // ── CRUD ──────────────────────────────────────────────────

  const selectDraft = useCallback((id: string) => {
    setActiveDraftId(id);
  }, [setActiveDraftId]);

  const createDraft = useCallback(async () => {
    const d = newDraft();
    await dbPut('drafts', d);
    setDrafts(prev => {
      const next = [d, ...prev];
      kvSet('draft-order', next.map(x => x.id)).catch(() => {});
      return next;
    });
    setActiveDraftId(d.id);
    return d.id;
  }, [setDrafts, setActiveDraftId]);

  const deleteDraft = useCallback(async (id: string) => {
    await dbDelete('drafts', id);
    setDrafts(prev => {
      const next = prev.filter(d => d.id !== id);
      if (next.length === 0) {
        const fresh = newDraft();
        dbPut('drafts', fresh).catch(() => {});
        kvSet('draft-order', [fresh.id]).catch(() => {});
        setActiveDraftId(fresh.id);
        return [fresh];
      }
      return next;
    });
    setActiveDraftIdState(prev => {
      if (prev === id) {
        // 找删除后第一个可用草稿（异步拿 state 不可靠，这里用 '' 让 activeDraft fallback 到 drafts[0]）
        return '';
      }
      return prev;
    });
  }, [setDrafts, setActiveDraftId]);

  const updateTitle = useCallback((id: string, title: string) => {
    setDraftsState(prev => {
      const next = prev.map(d => {
        if (d.id !== id) return d;
        const updated = { ...d, title };
        dbPut('drafts', updated).catch(() => {});
        return updated;
      });
      return next;
    });
  }, []);

  // content 更新：立即更新 React state（保证 UI 实时），IDB 写入防抖 300ms
  const flushContentToDb = useCallback((id: string, content: string) => {
    setDraftsState(prev => {
      const draft = prev.find(d => d.id === id);
      if (!draft) return prev;
      const updated = { ...draft, content, updatedAt: Date.now() };
      dbPut('drafts', updated).catch(() => {});
      return prev; // state 已由 useEditor 的 500ms 防抖更新，这里只负责 IDB 写
    });
  }, []);

  const debouncedFlush = useDebounceRef(flushContentToDb, 300);

  const updateContent = useCallback((id: string, content: string) => {
    setDraftsState(prev => {
      const next = prev.map(d => {
        if (d.id !== id) return d;
        return { ...d, content, updatedAt: Date.now() };
      });
      return next;
    });
    // IDB 写入防抖，不阻塞渲染
    debouncedFlush(id, content);
  }, [debouncedFlush]);

  const updateContextState = useCallback((id: string, contextState: DraftContextState) => {
    setDraftsState(prev => {
      const next = prev.map(d => {
        if (d.id !== id) return d;
        const updated = { ...d, contextState, updatedAt: Date.now() };
        dbPut('drafts', updated).catch(() => {});
        return updated;
      });
      return next;
    });
  }, []);

  const reorderDrafts = useCallback(async (fromIndex: number, toIndex: number) => {
    setDraftsState(prev => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      // 仅更新 order，不重写所有草稿内容
      kvSet('draft-order', next.map(d => d.id)).catch(() => {});
      return next;
    });
  }, []);

  /** 强制将当前所有草稿内容刷写到 IndexedDB（在 beforeunload 中调用） */
  const flushAll = useCallback(async (currentDrafts: Draft[]) => {
    await dbReplaceAll('drafts', currentDrafts);
    await kvSet('draft-order', currentDrafts.map(d => d.id));
  }, []);

  const activeDraft = drafts.find(d => d.id === activeDraftId) ?? drafts[0];

  return {
    drafts,
    activeDraft,
    activeDraftId: activeDraft?.id ?? '',
    loaded,
    selectDraft,
    createDraft,
    deleteDraft,
    updateTitle,
    updateContent,
    updateContextState,
    reorderDrafts,
    flushAll,
  };
}
