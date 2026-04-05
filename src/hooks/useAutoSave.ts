// =============================================================
// hooks/useAutoSave.ts — 自动保存 Hook
// =============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Draft } from './useBooks';
import type { AppSettings } from '../types';

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

  // ref 存最新值，避免 beforeunload 因依赖变化反复注册/注销
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const flushAllRef = useRef(flushAll);
  flushAllRef.current = flushAll;

  // 内容变化时防抖保存
  useEffect(() => {
    if (!settings.autoSave || !activeDraftId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      updateContent(activeDraftId, content);
      setSavedAt(Date.now());
    }, 800);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [content, activeDraftId, settings.autoSave, updateContent]);

  // beforeunload 只注册一次，通过 ref 访问最新数据
  const handleBeforeUnload = useCallback(() => {
    // beforeunload 中异步操作可能被浏览器中断，先同步触发立即写入
    flushAllRef.current(chaptersRef.current).catch(() => {});
  }, []); // 空依赖：通过 ref 获取最新值

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  return { savedAt };
}
