// src/api/autopilot.ts — 自动驾驶 API 客户端

import type { Book } from '../types';
import { syncCreateNovel } from './novels';

const BASE = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8005') + '/api/v1/autopilot';

export interface AutopilotStatus {
  autopilot_status: 'running' | 'stopped' | 'paused_for_review' | 'error' | 'completed';
  current_stage: string;
  current_act: number;
  current_beat_index: number;
  completed_chapters: number;
  manuscript_chapters: number;
  progress_pct: number;
  total_words: number;
  target_chapters: number;
  needs_review: boolean;
  consecutive_error_count: number;
  auto_approve_mode: boolean;
  last_chapter_audit?: {
    chapter_number: number;
    tension: number;
    drift_alert: boolean;
    issues: string[];
  } | null;
}

async function action(novelId: string, path: string, body?: object): Promise<{ success: boolean; message?: string } | null> {
  try {
    const r = await fetch(`${BASE}/${novelId}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as Record<string, unknown>;
      return { success: false, message: String(err.detail ?? r.statusText) };
    }
    return r.json() as Promise<{ success: boolean; message?: string }>;
  } catch {
    return { success: false, message: '无法连接后端' };
  }
}

/** 启动自动驾驶。若小说不存在后端则先同步创建，再重试一次。 */
export async function startAutopilot(
  novelId: string,
  book: Book,
  maxChapters = 9999,
): Promise<{ success: boolean; message?: string }> {
  let res = await action(novelId, '/start', { max_auto_chapters: maxChapters });
  if (!res) return { success: false, message: '无法连接后端' };

  // 404 = 小说未同步，自动创建后重试
  if (!res.success && res.message?.includes('不存在')) {
    await syncCreateNovel(book);
    await new Promise(r => setTimeout(r, 300));
    res = await action(novelId, '/start', { max_auto_chapters: maxChapters });
  }
  return res ?? { success: false, message: '未知错误' };
}

export async function stopAutopilot(novelId: string) {
  return action(novelId, '/stop');
}

export async function resumeAutopilot(novelId: string) {
  return action(novelId, '/resume');
}

export async function getAutopilotStatus(novelId: string): Promise<AutopilotStatus | null> {
  try {
    const r = await fetch(`${BASE}/${novelId}/status`);
    if (!r.ok) return null;
    return r.json() as Promise<AutopilotStatus>;
  } catch {
    return null;
  }
}

/** 订阅 SSE 状态事件流（每 3 秒一次）。返回取消订阅函数。 */
export function subscribeAutopilotEvents(
  novelId: string,
  onData: (status: Partial<AutopilotStatus>) => void,
  onError?: () => void,
): () => void {
  const es = new EventSource(`${BASE}/${novelId}/events`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as Partial<AutopilotStatus>;
      onData(data);
    } catch { /* ignore parse errors */ }
  };
  es.onerror = () => {
    onError?.();
    es.close();
  };
  return () => es.close();
}
