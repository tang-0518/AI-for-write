// =============================================================
// hooks/useAutoSave.ts - 自动保存 Hook
// =============================================================

import { useState, useEffect, useLayoutEffect, useRef, useEffectEvent } from 'react';
import { UNLOAD_BACKUP_STORAGE_KEY } from '../config/constants';
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
  const latestContentRef = useRef(content);

  useLayoutEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!settings.autoSave || !activeDraftId) return;

    const currentDraftId = activeDraftId;
    const scheduledContent = content;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      updateContent(currentDraftId, scheduledContent);
      setSavedAt(Date.now());
    }, 800);

    return () => {
      if (!timerRef.current) return;

      clearTimeout(timerRef.current);
      timerRef.current = null;

      if (currentDraftId) {
        updateContent(currentDraftId, latestContentRef.current);
      }
    };
  }, [activeDraftId, content, settings.autoSave, updateContent]);

  const handleBeforeUnload = useEffectEvent(() => {
    const synced = activeDraftId
      ? chapters.map(chapter => (
        chapter.id === activeDraftId
          ? { ...chapter, content, updatedAt: Date.now() }
          : chapter
      ))
      : chapters;

    try {
      if (activeDraftId) {
        localStorage.setItem(UNLOAD_BACKUP_STORAGE_KEY, JSON.stringify({
          draftId: activeDraftId,
          content,
          updatedAt: Date.now(),
        }));
      } else {
        localStorage.removeItem(UNLOAD_BACKUP_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures and fall back to the async flush below.
    }

    flushAll(synced).catch(() => {});
  });

  useEffect(() => {
    const listener = () => handleBeforeUnload();
    window.addEventListener('beforeunload', listener);
    window.addEventListener('pagehide', listener);

    return () => {
      window.removeEventListener('beforeunload', listener);
      window.removeEventListener('pagehide', listener);
    };
  }, []);

  return { savedAt };
}
