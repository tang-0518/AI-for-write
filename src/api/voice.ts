// src/api/voice.ts — 文风分析 / 漂移检测 API 客户端

const BASE = 'http://localhost:8005/api/v1';

export interface VoiceFingerprint {
  adjective_density: number;
  avg_sentence_length: number;
  sentence_count: number;
  sample_count: number;
  last_updated: string;
}

export interface StyleScoreItem {
  chapter_number: number;
  similarity_score: number;
  adjective_density: number;
  avg_sentence_length: number;
  sentence_count: number;
  computed_at: string;
}

export interface DriftReport {
  novel_id: string;
  scores: StyleScoreItem[];
  drift_alert: boolean;
  alert_threshold: number;
  alert_consecutive: number;
}

export interface ScoreResult {
  chapter_number: number;
  similarity_score: number | null;
  drift_alert: boolean;
}

/** 上传一对文风样本（AI 原文 vs 作者改稿）*/
export async function submitVoiceSample(
  novelId: string,
  sample: {
    ai_original: string;
    author_refined: string;
    chapter_number: number;
    scene_type?: string;
  },
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/voice/samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sample_id ?? null;
  } catch {
    return null;
  }
}

/** 获取文风指纹统计 */
export async function getVoiceFingerprint(
  novelId: string,
): Promise<VoiceFingerprint | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/voice/fingerprint`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 计算指定章节的文风相似度评分 */
export async function scoreChapterDrift(
  novelId: string,
  chapterNumber: number,
  content: string,
): Promise<ScoreResult | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/voice/drift/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter_number: chapterNumber, content }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 获取全量文风漂移报告 */
export async function getDriftReport(
  novelId: string,
): Promise<DriftReport | null> {
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/voice/drift`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
