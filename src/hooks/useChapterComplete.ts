// =============================================================
// hooks/useChapterComplete.ts — 章节完成（AI 提取真相文件）Hook
// =============================================================

import { useState, useCallback } from 'react';
import type { Draft } from './useBooks';
import type { AppSettings } from '../types';
import type { TruthFileType } from '../memory/types';
import { TRUTH_FILE_META } from '../memory/types';
import { callGemini, parseJsonObject } from '../api/gemini';

export type ChapterCompleteStatus = 'idle' | 'loading' | 'done' | 'error';

interface UseChapterCompleteOptions {
  activeDraft: Draft | undefined;
  activeBookId: string;
  settings: AppSettings;
  saveTruthFiles: (files: Array<{ type: TruthFileType; content: string }>) => Promise<void>;
  onSaveSnapshot: (content: string, title: string, label: string) => Promise<void>;
}

const TRUTH_FILE_TYPES: TruthFileType[] = [
  'current_state', 'particle_ledger', 'pending_hooks',
  'character_web', 'world_rules', 'foreshadow_log', 'pov_voice',
];

async function extractTruthFiles(
  content: string,
  settings: AppSettings,
): Promise<Array<{ type: TruthFileType; content: string }>> {
  const { apiKey, model } = settings;

  const typeDescriptions = TRUTH_FILE_TYPES.map(t =>
    `"${t}": ${TRUTH_FILE_META[t].description}`
  ).join('\n');

  const prompt = `你是一位专业的中文小说编辑。请从以下章节内容中提取并更新七个真相文件。

【章节内容】
${content.slice(0, 4000)}

请以 JSON 对象返回，key 为文件类型，value 为提取的内容（简洁、客观、200字以内）：
${typeDescriptions}

格式：
{
  "current_state": "...",
  "particle_ledger": "...",
  "pending_hooks": "...",
  "character_web": "...",
  "world_rules": "...",
  "foreshadow_log": "...",
  "pov_voice": "..."
}

只返回 JSON，不要其他文字。`;

  const raw = await callGemini(apiKey, model, prompt, { temperature: 0.3, maxOutputTokens: 4096 });
  const obj = parseJsonObject(raw);
  return TRUTH_FILE_TYPES
    .filter(t => obj[t]?.trim())
    .map(t => ({ type: t, content: obj[t].trim() }));
}

export function useChapterComplete({
  activeDraft,
  activeBookId: _activeBookId,
  settings,
  saveTruthFiles,
  onSaveSnapshot,
}: UseChapterCompleteOptions) {
  const [showModal, setShowModal] = useState(false);
  const [status, setStatus] = useState<ChapterCompleteStatus>('idle');
  const [extractedKeys, setExtractedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openModal = useCallback(() => {
    setStatus('idle');
    setExtractedKeys([]);
    setError(null);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const execute = useCallback(async () => {
    if (!activeDraft) { setError('没有活动章节'); return; }
    if (!settings.apiKey) { setError('请先在设置中填写 API Key'); return; }
    if (!activeDraft.content.trim()) { setError('章节内容为空，无法提取'); return; }

    // 提前捕获，避免执行中 activeDraft 变化导致保存的快照与提取内容不一致
    const draftSnapshot = { ...activeDraft };
    const settingsSnapshot = { ...settings };

    setStatus('loading');
    setError(null);

    try {
      const files = await extractTruthFiles(draftSnapshot.content, settingsSnapshot);
      await saveTruthFiles(files);
      await onSaveSnapshot(draftSnapshot.content, draftSnapshot.title, '完成章节');
      setExtractedKeys(files.map(f => f.type));
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取失败，请重试');
      setStatus('error');
    }
  }, [activeDraft, settings, saveTruthFiles, onSaveSnapshot]);

  return { showModal, status, extractedKeys, error, openModal, closeModal, execute };
}
