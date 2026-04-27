// =============================================================
// hooks/useStyleLearning.ts — 文风档案 CRUD + 分析调度
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import { dbGetAll, dbPut, dbDelete } from '../db/index';
import type { StyleProfile } from '../types/styleProfile';
import type { AppSettings } from '../types';
import { analyzeWritingStyle } from '../api/styleAnalysis';

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error';

export function useStyleLearning(settings: AppSettings) {
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // ── 加载全部档案 ─────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const all = await dbGetAll<StyleProfile>('style_profiles');
      setProfiles(all.slice().sort((a, b) => b.analyzedAt - a.analyzedAt));
    } catch { /* 首次打开可能还没有 store，静默处理 */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProfiles = async () => {
      try {
        const all = await dbGetAll<StyleProfile>('style_profiles');
        if (!cancelled) {
          setProfiles(all.slice().sort((a, b) => b.analyzedAt - a.analyzedAt));
        }
      } catch {
        // 棣栨鎵撳紑鍙兘杩樻病鏈?store锛岄潤榛樺鐞?
      }
    };
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 创建档案（分析 + 保存） ──────────────────────────────
  const createProfile = useCallback(async (params: {
    name: string;
    sourceBookId: string;
    chapters: { id: string; title: string; content: string }[];
  }): Promise<StyleProfile | null> => {
    if (!settings.apiKey) {
      setErrorMsg('请先在设置中填入 Gemini API Key');
      setStatus('error');
      return null;
    }
    if (params.chapters.length === 0) {
      setErrorMsg('请至少选择 1 个章节');
      setStatus('error');
      return null;
    }

    setStatus('analyzing');
    setErrorMsg('');

    try {
      const partial = await analyzeWritingStyle(params.chapters, settings);
      const now = Date.now();
      const profile: StyleProfile = {
        id: `sp_${now}_${Math.random().toString(36).slice(2, 6)}`,
        name: params.name.trim() || '未命名文风',
        sourceBookId: params.sourceBookId,
        sourceChapterIds: params.chapters.map(c => c.id),
        analyzedAt: now,
        ...partial,
      };
      await dbPut('style_profiles', profile);
      await reload();
      setStatus('done');
      return profile;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '分析失败，请重试');
      setStatus('error');
      return null;
    }
  }, [settings, reload]);

  // ── 删除档案 ─────────────────────────────────────────────
  const deleteProfile = useCallback(async (id: string) => {
    await dbDelete('style_profiles', id);
    setProfiles(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── 重命名档案 ───────────────────────────────────────────
  const renameProfile = useCallback(async (id: string, newName: string) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    const updated: StyleProfile = { ...profile, name: newName.trim() || profile.name };
    await dbPut('style_profiles', updated);
    setProfiles(prev => prev.map(p => p.id === id ? updated : p));
  }, [profiles]);

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setErrorMsg('');
  }, []);

  return {
    profiles,
    status,
    errorMsg,
    createProfile,
    deleteProfile,
    renameProfile,
    resetStatus,
    reload,
  };
}
