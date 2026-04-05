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
}

export function useOutline(bookId: string) {
  const [cards, setCards] = useState<OutlineCard[]>([]);

  useEffect(() => {
    if (!bookId) { setCards([]); return; }
    kvGet<OutlineCard[]>(`outline-${bookId}`)
      .then(data => { if (data) setCards(data); else setCards([]); })
      .catch(() => setCards([]));
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
      const updated = prev.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i }));
      persist(updated);
      return updated;
    });
  }, [persist]);

  const reorderCards = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return; // 边界：相同位置无需操作
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

  return { cards, addCard, updateCard, deleteCard, reorderCards, setAllCards };
}
