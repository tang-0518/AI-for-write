// =============================================================
// types.ts
// =============================================================

export type WritingStyle = 'general' | 'wuxia' | 'romance' | 'mystery' | 'scifi';

export type WriteLength = 'short' | 'medium' | 'long';
export interface LengthConfig { label: string; tokens: number; hint: string; }
export const LENGTH_CONFIGS: Record<WriteLength, LengthConfig> = {
  short:  { label: '短', tokens: 1200, hint: '约 150 字' },
  medium: { label: '中', tokens: 2500, hint: '约 300 字' },
  long:   { label: '长', tokens: 5000, hint: '约 500+ 字' },
};

export interface AppSettings {
  schemaVersion: number;         // 迁移版本号，每次结构变更递增
  apiKey: string;
  style: WritingStyle;
  autoSave: boolean;
  model: string;
  writeLength: WriteLength;
  customPrompt: string;
  wordGoal: number;
  usePrevChapterContext: boolean;
  // ── 上下文策略（Phase 3）──
  compactTriggerRatio: number;   // 压缩触发阈值，默认 0.85
  memoryTokenBudget: number;     // 记忆库 token 预算，默认 1500
}

// ── 书目 ──────────────────────────────────────────────────────
export interface Book {
  id: string;
  title: string;
  synopsis: string;
  createdAt: number;
  updatedAt: number;
}

export interface DraftContextState {
  compactionCount: number;
  consecutiveCompactFailures: number;
  compactDisabled: boolean;
  compactSummary: string;
  lastCompactedAt: number | null;
}

export const DEFAULT_DRAFT_CONTEXT_STATE: DraftContextState = {
  compactionCount: 0,
  consecutiveCompactFailures: 0,
  compactDisabled: false,
  compactSummary: '',
  lastCompactedAt: null,
};

export interface EditorState {
  content: string;
  isStreaming: boolean;
  isPolishing: boolean;
  error: string | null;
}

export interface StyleConfig {
  label: string;
  prompt: string;
  emoji: string;
}

export const STYLE_CONFIGS: Record<WritingStyle, StyleConfig> = {
  general: { label: '通用', prompt: '以优美流畅的现代汉语', emoji: '✍️' },
  wuxia:   { label: '武侠', prompt: '以金常式武侠江湖笔法，侠气纵横', emoji: '⚔️' },
  romance: { label: '言情', prompt: '以细腻温柔的情感描写，缠绵悲恨', emoji: '🌸' },
  mystery: { label: '悬疑', prompt: '以紧张悬疑的笔法，层层推进', emoji: '🔍' },
  scifi:   { label: '科幻', prompt: '以硬科幻世界观，逻辑严密', emoji: '🚀' },
};

export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  apiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  style: 'general',
  autoSave: true,
  model: import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-2.5-pro',
  writeLength: 'medium',
  customPrompt: '',
  wordGoal: 0,
  usePrevChapterContext: true,
  compactTriggerRatio: 0.85,
  memoryTokenBudget: 1500,
};
