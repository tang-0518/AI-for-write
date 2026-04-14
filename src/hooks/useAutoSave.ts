// =============================================================
// hooks/useAutoSave.ts — 自动保存 Hook
// =============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Draft } from './useBooks';
import type { AppSettings } from '../types';

// ref 用于在 cleanup 中访问最新值
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface UseAutoSaveOptions {
  activeDraftId: string;
  content: string;
  chapters: Draft[];
  settings: AppSettings;
  updateContent: (id: string, content: string) => void;
  flushAll: (chapters: Draft[]) => Promise<void>;
}

export function useAutoSave({
  activeDraftId,
  content,
  chapters,
  settings,
  updateContent,
  flushAll,
}: UseAutoSaveOptions) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ref 存最新值，避免 beforeunload / cleanup 访问陈旧闭包
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const flushAllRef = useRef(flushAll);
  flushAllRef.current = flushAll;
  const contentRef = useLatestRef(content);
  const activeDraftIdRef = useLatestRef(activeDraftId);

  // 内容变化时防抖保存；章节切换时立即刷写（避免切走丢失末尾修改）
  useEffect(() => {
    if (!settings.autoSave || !activeDraftId) return;
    // 捕获当前 effect 对应的 draftId，cleanup 时使用此值而非 ref
    const currentDraftId = activeDraftId;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      updateContent(currentDraftId, contentRef.current);
      setSavedAt(Date.now());
    }, 800);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        // 章节切换（activeDraftId 变化触发 cleanup）：立即保存到旧章节
        const latestContent = contentRef.current;
        if (currentDraftId && latestContent !== undefined) {
          updateContent(currentDraftId, latestContent);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, activeDraftId, settings.autoSave, updateContent]);

  // beforeunload 只注册一次，通过 ref 访问最新数据
  const handleBeforeUnload = useCallback(() => {
    // 将当前编辑器内容同步到 chapters 数组后再刷盘，避免丢失未保存的修改
    const id = activeDraftIdRef.current;
    const latestContent = contentRef.current;
    const currentChapters = chaptersRef.current;
    const synced = id
      ? currentChapters.map(c => c.id === id ? { ...c, content: latestContent, updatedAt: Date.now() } : c)
      : currentChapters;
    flushAllRef.current(synced).catch(() => {});
  }, []); // 空依赖：通过 ref 获取最新值

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  return { savedAt };
}
