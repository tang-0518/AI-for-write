// =============================================================
// hooks/useSnapshots.ts - 章节版本快照 Hook
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import { kvGet, kvSet } from '../db/index';

export interface Snapshot {
  id: string;
  draftId: string;
  bookId: string;
  content: string;
  label: string;
  createdAt: number;
  pinned?: boolean;
}

const MAX_SNAPSHOTS = 20;

export function useSnapshots(draftId: string, bookId: string) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [warningRequested, setWarningRequested] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshots = async () => {
      if (!draftId) {
        if (!cancelled) setSnapshots([]);
        return;
      }

      try {
        const data = await kvGet<Snapshot[]>(`snapshots-${draftId}`);
        if (!cancelled) setSnapshots(data ?? []);
      } catch {
        if (!cancelled) setSnapshots([]);
      }
    };

    void loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const allPinnedAndFull =
    snapshots.length >= MAX_SNAPSHOTS &&
    snapshots.length > 0 &&
    snapshots.every(snapshot => snapshot.pinned);
  const overLimitWarning = warningRequested && allPinnedAndFull;

  const saveSnapshot = useCallback(async (content: string, title: string, label: string) => {
    if (!draftId || !content.trim()) return;

    const snapshot: Snapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      draftId,
      bookId,
      content,
      label: `${label} — ${title}`,
      createdAt: Date.now(),
    };

    setSnapshots(prev => {
      const unpinned = prev.filter(item => !item.pinned);
      const pinned = prev.filter(item => item.pinned);
      const total = prev.length + 1;

      let next: Snapshot[];
      if (total > MAX_SNAPSHOTS) {
        if (unpinned.length === 0) {
          setWarningRequested(true);
          return prev;
        }
        const trimmed = unpinned.slice(0, unpinned.length - 1);
        next = [snapshot, ...pinned, ...trimmed];
      } else {
        next = [snapshot, ...prev];
      }

      setWarningRequested(false);
      kvSet(`snapshots-${draftId}`, next).catch(() => {});
      return next;
    });
  }, [draftId, bookId]);

  const deleteSnapshot = useCallback(async (id: string) => {
    setSnapshots(prev => {
      const next = prev.filter(snapshot => snapshot.id !== id);
      kvSet(`snapshots-${draftId}`, next).catch(() => {});
      return next;
    });
  }, [draftId]);

  const pinSnapshot = useCallback((id: string, pinned: boolean) => {
    setSnapshots(prev => {
      const next = prev.map(snapshot => (
        snapshot.id === id ? { ...snapshot, pinned } : snapshot
      ));
      kvSet(`snapshots-${draftId}`, next).catch(() => {});
      return next;
    });
  }, [draftId]);

  const dismissOverLimitWarning = useCallback(() => setWarningRequested(false), []);

  return { snapshots, saveSnapshot, deleteSnapshot, pinSnapshot, overLimitWarning, dismissOverLimitWarning };
}
