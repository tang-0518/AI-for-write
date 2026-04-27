// =============================================================
// hooks/useCapsules.ts - character capsule hook
// =============================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  loadCapsulesByBook,
  upsertCapsuleAsync,
  deleteCapsuleAsync,
  buildNewCapsule,
  migrateCapsuleFromMemory,
} from '../capsule/db';
import type { CharacterCapsule } from '../capsule/types';
import { buildCapsulesContext, detectSceneCharacters } from '../capsule/promptBuilder';
import type { MemoryEntry } from '../memory/types';

export function useCapsules(activeBookId?: string) {
  const [capsules, setCapsules] = useState<CharacterCapsule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCapsules = async () => {
      if (!activeBookId) {
        if (!cancelled) {
          setCapsules([]);
          setLoaded(true);
        }
        return;
      }

      if (!cancelled) setLoaded(false);

      try {
        const data = await loadCapsulesByBook(activeBookId);
        if (!cancelled) {
          setCapsules(data);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };

    void loadCapsules();

    return () => {
      cancelled = true;
    };
  }, [activeBookId]);

  const reload = useCallback(async () => {
    if (!activeBookId) {
      setCapsules([]);
      return;
    }

    const data = await loadCapsulesByBook(activeBookId);
    setCapsules(data);
  }, [activeBookId]);

  const create = useCallback(async (
    name: string,
    partial: Partial<Omit<CharacterCapsule, 'id' | 'bookId' | 'name'>> = {},
  ): Promise<CharacterCapsule> => {
    if (!activeBookId) throw new Error('未选择书目');

    const draft = buildNewCapsule(activeBookId, name, partial);
    const saved = await upsertCapsuleAsync(draft);
    setCapsules(prev => [saved, ...prev.filter(c => c.id !== saved.id)]);
    return saved;
  }, [activeBookId]);

  const update = useCallback(async (
    id: string,
    patch: Partial<Omit<CharacterCapsule, 'id' | 'bookId' | 'createdAt' | 'updatedAt' | 'promptSnippet' | 'tokenEstimate'>>,
  ): Promise<CharacterCapsule> => {
    const current = capsules.find(c => c.id === id);
    if (!current) throw new Error(`胶囊 ${id} 不存在`);

    const saved = await upsertCapsuleAsync({ ...current, id, ...patch });
    setCapsules(prev => prev.map(c => c.id === id ? saved : c));
    return saved;
  }, [capsules]);

  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteCapsuleAsync(id);
    setCapsules(prev => prev.filter(c => c.id !== id));
  }, []);

  const migrateFromMemory = useCallback(async (
    characterEntries: MemoryEntry[],
  ): Promise<number> => {
    if (!activeBookId) return 0;

    let count = 0;
    for (const entry of characterEntries) {
      if (capsules.some(c => c.name === entry.name)) continue;
      await migrateCapsuleFromMemory({ ...entry, bookId: activeBookId });
      count++;
    }

    await reload();
    return count;
  }, [activeBookId, capsules, reload]);

  const buildSceneContext = useCallback((
    currentText: string,
    tokenBudget = 600,
  ): string => {
    const relevant = detectSceneCharacters(currentText, capsules);
    const targets = relevant.length > 0 ? relevant : capsules.slice(0, 3);
    return buildCapsulesContext(targets, tokenBudget);
  }, [capsules]);

  const findByName = useCallback((name: string): CharacterCapsule | undefined => {
    return capsules.find(c => c.name === name);
  }, [capsules]);

  const stats = useMemo(() => ({
    total: capsules.length,
    totalTokens: capsules.reduce((sum, capsule) => sum + (capsule.tokenEstimate ?? 0), 0),
  }), [capsules]);

  return {
    capsules,
    loaded,
    stats,
    create,
    update,
    remove,
    reload,
    migrateFromMemory,
    buildSceneContext,
    findByName,
  };
}
