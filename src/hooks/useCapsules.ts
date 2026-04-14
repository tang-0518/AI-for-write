// =============================================================
// hooks/useCapsules.ts — 角色胶囊 React Hook
// =============================================================

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  const [loaded,   setLoaded]   = useState(false);

  const capsulesRef = useRef(capsules);
  capsulesRef.current = capsules;

  // ── 初始加载 ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeBookId) { setLoaded(true); return; }
    loadCapsulesByBook(activeBookId)
      .then(data => { setCapsules(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [activeBookId]);

  // ── 刷新 ─────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!activeBookId) return;
    const data = await loadCapsulesByBook(activeBookId);
    setCapsules(data);
  }, [activeBookId]);

  // ── 新建 ─────────────────────────────────────────────────
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

  // ── 更新（patch 模式）────────────────────────────────────
  const update = useCallback(async (
    id: string,
    patch: Partial<Omit<CharacterCapsule, 'id' | 'bookId' | 'createdAt' | 'updatedAt' | 'promptSnippet' | 'tokenEstimate'>>,
  ): Promise<CharacterCapsule> => {
    const current = capsulesRef.current.find(c => c.id === id);
    if (!current) throw new Error(`胶囊 ${id} 不存在`);
    const saved = await upsertCapsuleAsync({ ...current, id, ...patch });
    setCapsules(prev => prev.map(c => c.id === id ? saved : c));
    return saved;
  }, []);

  // ── 删除 ─────────────────────────────────────────────────
  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteCapsuleAsync(id);
    setCapsules(prev => prev.filter(c => c.id !== id));
  }, []);

  // ── 从记忆宫殿迁移 ───────────────────────────────────────
  const migrateFromMemory = useCallback(async (
    characterEntries: MemoryEntry[],
  ): Promise<number> => {
    if (!activeBookId) return 0;
    let count = 0;
    for (const entry of characterEntries) {
      // 避免重复迁移（名字相同的胶囊已存在则跳过）
      const exists = capsulesRef.current.some(c => c.name === entry.name);
      if (exists) continue;
      await migrateCapsuleFromMemory({ ...entry, bookId: activeBookId });
      count++;
    }
    await reload();
    return count;
  }, [activeBookId, reload]);

  // ── 场景上下文装配 ────────────────────────────────────────
  // 检测当前文本中出现的角色，返回其胶囊 prompt 组合
  const buildSceneContext = useCallback((
    currentText: string,
    tokenBudget = 600,
  ): string => {
    const relevant = detectSceneCharacters(currentText, capsulesRef.current);
    // 优先注入场景中出现的角色，若没有则取前3个
    const targets = relevant.length > 0 ? relevant : capsulesRef.current.slice(0, 3);
    return buildCapsulesContext(targets, tokenBudget);
  }, []);

  // ── 按名字查找 ───────────────────────────────────────────
  const findByName = useCallback((name: string): CharacterCapsule | undefined => {
    return capsulesRef.current.find(c => c.name === name);
  }, []);

  // ── 统计 ─────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       capsules.length,
    totalTokens: capsules.reduce((s, c) => s + (c.tokenEstimate ?? 0), 0),
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
