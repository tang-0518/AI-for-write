// src/api/beats.ts — 节拍表后端 API 客户端

import type { Beat, BeatFocus } from '../beats/types';
import { generateId } from '../utils/id';

const BASE = 'http://localhost:8005/api/v1/beat-sheets';

interface BackendScene {
  title: string;
  goal: string;
  pov_character: string;
  location: string | null;
  tone: string | null;
  estimated_words: number;
  order_index: number;
}

interface BackendBeatSheet {
  id: string;
  chapter_id: string;
  scenes: BackendScene[];
  total_scenes: number;
  total_estimated_words: number;
}

function toneToFocus(tone: string | null): BeatFocus {
  if (!tone) return 'action';
  const t = tone.toLowerCase();
  if (t.includes('对话') || t.includes('dialogue')) return 'dialogue';
  if (t.includes('情绪') || t.includes('emotion') || t.includes('内心')) return 'emotion';
  if (t.includes('感官') || t.includes('sensory') || t.includes('环境')) return 'sensory';
  if (t.includes('悬念') || t.includes('suspense') || t.includes('紧张')) return 'suspense';
  if (t.includes('登场') || t.includes('intro') || t.includes('出场')) return 'character_intro';
  if (t.includes('钩') || t.includes('hook') || t.includes('开篇')) return 'hook';
  return 'action';
}

function sceneToBeat(scene: BackendScene): Beat {
  const desc = scene.goal
    ? `${scene.title}：${scene.goal}`
    : scene.title;

  return {
    id: generateId(),
    description: desc,
    targetWords: scene.estimated_words,
    focus: toneToFocus(scene.tone),
    status: 'pending',
  };
}

/** 调用后端 AI 生成节拍表，返回前端 Beat[] */
export async function generateBeatSheetFromBackend(
  chapterId: string,
  outline: string,
): Promise<Beat[] | null> {
  try {
    const res = await fetch(`${BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter_id: chapterId, outline }),
    });
    if (!res.ok) return null;
    const data: BackendBeatSheet = await res.json();
    return data.scenes
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map(sceneToBeat);
  } catch {
    return null;
  }
}

/** 获取指定章节的缓存节拍表 */
export async function getBeatSheet(chapterId: string): Promise<Beat[] | null> {
  try {
    const res = await fetch(`${BASE}/${chapterId}`);
    if (!res.ok) return null;
    const data: BackendBeatSheet = await res.json();
    return data.scenes
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map(sceneToBeat);
  } catch {
    return null;
  }
}

/** 删除章节的节拍表缓存 */
export async function deleteBeatSheet(chapterId: string): Promise<void> {
  try {
    await fetch(`${BASE}/${chapterId}`, { method: 'DELETE' });
  } catch {
    // fire-and-forget
  }
}
