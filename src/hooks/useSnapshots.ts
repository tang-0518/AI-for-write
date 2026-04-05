// =============================================================
// hooks/useSnapshots.ts — 章节版本快照 Hook
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
  pinned?: boolean; // 标记为重要，免于自动清除
}

const MAX_SNAPSHOTS = 20;

export function useSnapshots(draftId: string, bookId: string) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  // 超限提示：返回给 UI 让用户决定如何处理
  const [overLimitWarning, setOverLimitWarning] = useState(false);

  useEffect(() => {
    if (!draftId) { setSnapshots([]); return; }
    kvGet<Snapshot[]>(`snapshots-${draftId}`)
      .then(data => { if (data) setSnapshots(data); else setSnapshots([]); })
      .catch(() => setSnapshots([]));
  }, [draftId]);

  const saveSnapshot = useCallback(async (content: string, title: string, label: string) => {
    if (!draftId || !content.trim()) return;
    const snap: Snapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      draftId,
      bookId,
      content,
      label: `${label} — ${title}`,
      createdAt: Date.now(),
    };
    setSnapshots(prev => {
      const unpinned = prev.filter(s => !s.pinned);
      const pinned   = prev.filter(s => s.pinned);
      const total    = prev.length + 1;

      let next: Snapshot[];
      if (total > MAX_SNAPSHOTS) {
        if (unpinned.length === 0) {
          // 全部已标记为重要：提示用户，不静默删除
          setOverLimitWarning(true);
          return prev;
        }
        // 自动清除最旧的未标记快照
        const trimmed = unpinned.slice(0, unpinned.length - 1);
        next = [snap, ...pinned, ...trimmed];
      } else {
        next = [snap, ...prev];
      }

      kvSet(`snapshots-${draftId}`, next).catch(() => {});
      return next;
    });
  }, [draftId, bookId]);

  const deleteSnapshot = useCallback(async (id: string) => {
    setSnapshots(prev => {
      const next = prev.filter(s => s.id !== id);
      kvSet(`snapshots-${draftId}`, next).catch(() => {});
      return next;
    });
  }, [draftId]);

  // 切换重要标记
  const pinSnapshot = useCallback((id: string, pinned: boolean) => {
    setSnapshots(prev => {
      const next = prev.map(s => s.id === id ? { ...s, pinned } : s);
      kvSet(`snapshots-${draftId}`, next).catch(() => {});
      return next;
    });
  }, [draftId]);

  const dismissOverLimitWarning = useCallback(() => setOverLimitWarning(false), []);

  return { snapshots, saveSnapshot, deleteSnapshot, pinSnapshot, overLimitWarning, dismissOverLimitWarning };
}
