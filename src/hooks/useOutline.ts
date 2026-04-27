// =============================================================
// hooks/useOutline.ts — 章节大纲管理 Hook
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import { kvGet, kvSet } from '../db/index';

export interface OutlineCard {
  id: string;
  title: string;
  synopsis: string;
  status: 'planned' | 'writing' | 'done';
  order: number;
  parentId?: string | null;   // null/undefined = 根节点直接子节点
}

export interface CanvasNodePosition {
  id: string;
  x: number;
  y: number;
}

export function useOutline(bookId: string) {
  const [cards, setCards] = useState<OutlineCard[]>([]);
  const [canvasPositions, setCanvasPositions] = useState<CanvasNodePosition[]>([]);

  // 加载卡片
  useEffect(() => {
    let cancelled = false;
    const loadCards = async () => {
      if (!bookId) {
        if (!cancelled) setCards([]);
        return;
      }
      try {
        const data = await kvGet<OutlineCard[]>(`outline-${bookId}`);
        if (!cancelled) setCards(data ?? []);
      } catch {
        if (!cancelled) setCards([]);
      }
    };
    void loadCards();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // 加载画布节点位置
  useEffect(() => {
    let cancelled = false;
    const loadCanvasPositions = async () => {
      if (!bookId) {
        if (!cancelled) setCanvasPositions([]);
        return;
      }
      try {
        const data = await kvGet<CanvasNodePosition[]>(`canvas-positions-${bookId}`);
        if (!cancelled) setCanvasPositions(data ?? []);
      } catch {
        if (!cancelled) setCanvasPositions([]);
      }
    };
    void loadCanvasPositions();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const persist = useCallback((next: OutlineCard[]) => {
    kvSet(`outline-${bookId}`, next).catch(() => {});
  }, [bookId]);

  const addCard = useCallback((card: Omit<OutlineCard, 'id' | 'order'>) => {
    setCards(prev => {
      const next: OutlineCard = {
        ...card,
        id: `oc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        order: prev.length,
      };
      const updated = [...prev, next];
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateCard = useCallback((id: string, patch: Partial<Omit<OutlineCard, 'id'>>) => {
    setCards(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...patch } : c);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const deleteCard = useCallback((id: string) => {
    setCards(prev => {
      // 删除节点时，将其子节点的 parentId 置为 null（提升到根层）
      const updated = prev
        .filter(c => c.id !== id)
        .map((c, i) => ({
          ...c,
          order: i,
          parentId: c.parentId === id ? null : c.parentId,
        }));
      persist(updated);
      return updated;
    });
    // 同时清除其画布位置
    setCanvasPositions(prev => {
      const next = prev.filter(p => p.id !== id);
      kvSet(`canvas-positions-${bookId}`, next).catch(() => {});
      return next;
    });
  }, [persist, bookId]);

  const reorderCards = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setCards(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      const updated = next.map((c, i) => ({ ...c, order: i }));
      persist(updated);
      return updated;
    });
  }, [persist]);

  const setAllCards = useCallback((next: OutlineCard[]) => {
    setCards(next);
    persist(next);
  }, [persist]);

  // 更新单个节点的画布位置并持久化
  const setNodePosition = useCallback((id: string, x: number, y: number) => {
    setCanvasPositions(prev => {
      const exists = prev.find(p => p.id === id);
      const next = exists
        ? prev.map(p => p.id === id ? { id, x, y } : p)
        : [...prev, { id, x, y }];
      kvSet(`canvas-positions-${bookId}`, next).catch(() => {});
      return next;
    });
  }, [bookId]);

  return {
    cards,
    canvasPositions,
    addCard,
    updateCard,
    deleteCard,
    reorderCards,
    setAllCards,
    setNodePosition,
  };
}
