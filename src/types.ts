// =============================================================
// types.ts
// =============================================================

export type WritingStyle = 'general' | 'wuxia' | 'romance' | 'mystery' | 'scifi';

export type WriteLength = 'short' | 'medium' | 'long';
export interface LengthConfig { label: string; tokens: number; hint: string; }
// tokens 仅作安全上限，不控制字数（字数由 prompt 指令控制）
// Gemini 2.5 Pro 的 thinking tokens 也计入此预算，需留足余量
export const LENGTH_CONFIGS: Record<WriteLength, LengthConfig> = {
  short:  { label: '短', tokens: 8192,  hint: '约 150 字' },
  medium: { label: '中', tokens: 16384, hint: '约 300 字' },
  long:   { label: '长', tokens: 32768, hint: '约 500 字' },
};

export type CreativityLevel = 'precise' | 'balanced' | 'creative' | 'wild';
export const CREATIVITY_CONFIGS: Record<CreativityLevel, { label: string; temperature: number; hint: string }> = {
  precise:  { label: '精确', temperature: 0.65, hint: '逻辑严密，风格稳定，幻觉最少' },
  balanced: { label: '均衡', temperature: 0.82, hint: '创意与一致性兼顾（推荐）' },
  creative: { label: '创意', temperature: 1.0,  hint: '更多惊喜走向，偶有设定偏差' },
  wild:     { label: '狂野', temperature: 1.2,  hint: '高度随机，适合头脑风暴' },
};

export interface AppSettings {
  schemaVersion: number;         // 迁移版本号，每次结构变更递增
  apiKey: string;
  style: WritingStyle;
  autoSave: boolean;
  model: string;
  writeLength: WriteLength;
  customPrompt: string;
  promptPresets: PromptPreset[]; // 指令预设库
  creativity: CreativityLevel;   // 创意度/幻觉控制
  wordGoal: number;
  usePrevChapterContext: boolean;
  // ── 上下文策略 ──
  compactTriggerRatio: number;   // 压缩触发阈值，默认 0.85
  memoryTokenBudget: number;     // 记忆库 token 预算，默认 1500
  // ── 编辑器外观 ──
  editorFontSize: number;        // 12–26，默认 17
  editorFont: string;            // CSS font-family 字符串
  // ── 模仿模式 ──
  imitationMode: boolean;        // 是否开启文风模仿
  imitationProfileId: string;    // 激活的文风档案 ID（空字符串=未选）
  modularWriting: boolean;       // 是否开启模块化写作（分块着色）
}

// ── 写作块（模块化写作用，追踪每次 AI 续写的文字范围）────────
export interface WritingBlock {
  id: string;
  start: number;           // 在正文中的字符起始位置
  end: number;             // 结束位置（exclusive）
  colorIndex: number;      // 颜色索引 0–9，循环
  generatedAt: number;
  styleProfileId?: string; // 使用的文风档案 ID（可选）
}

export const EDITOR_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '诺托宋体（默认）', value: "'Noto Serif SC', serif" },
  { label: '宋体 SimSun',      value: "'SimSun', '宋体', serif" },
  { label: '仿宋 FangSong',    value: "'FangSong', '仿宋', serif" },
  { label: '楷体 KaiTi',       value: "'KaiTi', '楷体', serif" },
  { label: '黑体 / 系统无衬线',  value: "'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { label: '等宽 Monospace',   value: "'Courier New', 'Consolas', monospace" },
];

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

// ── 指令预设 ─────────────────────────────────────────────────
export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
}

export const SETTINGS_SCHEMA_VERSION = 4;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  apiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  style: 'general',
  autoSave: true,
  model: import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-2.5-pro',
  writeLength: 'medium',
  customPrompt: '',
  promptPresets: [],
  creativity: 'balanced',
  wordGoal: 0,
  usePrevChapterContext: true,
  compactTriggerRatio: 0.85,
  memoryTokenBudget: 1500,
  editorFontSize: 17,
  editorFont: "'Noto Serif SC', serif",
  imitationMode: false,
  imitationProfileId: '',
  modularWriting: false,
};
