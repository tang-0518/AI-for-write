// =============================================================
// types.ts — 全局类型定义与常量
//
// 【职责】
//   这是整个项目的"类型字典"。所有跨文件共享的类型、枚举、
//   配置常量都定义在这里，其他文件通过 import type 引入。
//
// 【学习建议】
//   先读这个文件，再读其他文件。理解这些类型后，其他文件的
//   函数签名和逻辑都会更容易理解。
//
// 【被哪些文件使用】
//   几乎所有文件都 import from '../types' 或 './types'
// =============================================================

// ── 写作风格 ──────────────────────────────────────────────────
// 每种风格对应一段 Prompt 描述，在 gemini.ts 构建 systemInstruction 时使用
export type WritingStyle = 'wuxia' | 'romance' | 'mystery' | 'scifi';

// ── 润色/修订模式 ─────────────────────────────────────────────
// 用户在 CommandBar 选择润色模式时传递给 polishText()
// 每种模式对应不同的 AI 指令策略（见 gemini.ts buildPolishSystemInstruction）
export type PolishMode = 'standard' | 'spot-fix' | 'rewrite' | 'rework' | 'anti-detect';

export interface PolishModeConfig {
  label: string;
  desc: string;
  emoji: string;
}

// 润色模式的 UI 展示配置，由 CommandBar.tsx 读取渲染下拉菜单
export const POLISH_MODE_CONFIGS: Record<PolishMode, PolishModeConfig> = {
  'standard':     { label: '标准润色', desc: '优化措辞、增强文学性', emoji: '💎' },
  'spot-fix':     { label: '点修',     desc: '仅修错别字与语法错误', emoji: '🔧' },
  'rewrite':      { label: '重写',     desc: '保留情节，全新句式', emoji: '✏️' },
  'rework':       { label: '重构',     desc: '重组段落逻辑与节奏', emoji: '🔄' },
  'anti-detect':  { label: '去AI化',   desc: '减少AI痕迹，更像人写', emoji: '🕵️' },
};

// ── 续写长度 ──────────────────────────────────────────────────
// tokens 字段是 maxOutputTokens 的安全上限，不直接控制字数；
// 字数由 Prompt 里的指令（"续写 X 字以内"）控制。
// Gemini 2.5 Pro 的 thinking tokens 也计入此预算，需留足余量。
export type WriteLength = 'short' | 'medium' | 'long';
export interface LengthConfig { label: string; tokens: number; hint: string; }
export const LENGTH_CONFIGS: Record<WriteLength, LengthConfig> = {
  short:  { label: '短', tokens: 8192,  hint: '约 150 字' },
  medium: { label: '中', tokens: 16384, hint: '约 300 字' },
  long:   { label: '长', tokens: 32768, hint: '约 500 字' },
};

// ── 创意度（对应 Gemini temperature 参数） ────────────────────
// temperature 越高 → AI 输出越随机；越低 → 越保守稳定
export type CreativityLevel = 'precise' | 'balanced' | 'creative' | 'wild';
export const CREATIVITY_CONFIGS: Record<CreativityLevel, { label: string; temperature: number; hint: string }> = {
  precise:  { label: '精确', temperature: 0.65, hint: '逻辑严密，风格稳定，幻觉最少' },
  balanced: { label: '均衡', temperature: 0.82, hint: '创意与一致性兼顾（推荐）' },
  creative: { label: '创意', temperature: 1.0,  hint: '更多惊喜走向，偶有设定偏差' },
  wild:     { label: '狂野', temperature: 1.2,  hint: '高度随机，适合头脑风暴' },
};

// ── 应用设置（持久化到 localStorage + IndexedDB kv 表） ───────
// schemaVersion 用于 settingsMigration.ts 的版本迁移逻辑
export interface AppSettings {
  schemaVersion: number;         // 迁移版本号，每次结构变更递增
  apiKey: string;
  style: WritingStyle;
  autoSave: boolean;
  model: string;                 // 如 'gemini-2.5-pro'，影响 token 上限和 thinking 行为
  writeLength: WriteLength;
  customPrompt: string;          // 长期写作风格要求，注入每次续写的 systemInstruction
  promptPresets: PromptPreset[]; // 指令预设库（快速选用的 oneTimePrompt 模板）
  creativity: CreativityLevel;
  wordGoal: number;              // 今日字数目标，由 useWritingStats 跟踪
  usePrevChapterContext: boolean; // 是否将前章结尾注入续写上下文
  // ── 上下文压缩策略（见 contextCompression.ts） ──
  compactTriggerRatio: number;   // 正文超过上下文窗口的 X% 时触发压缩，默认 0.85
  memoryTokenBudget: number;     // 记忆宫殿注入续写的 token 上限，默认 1500
  // ── 编辑器外观 ──
  editorFontSize: number;        // 12–26，默认 17
  editorFont: string;            // CSS font-family 字符串
  // ── 文风模仿模式 ──
  imitationMode: boolean;        // 开启后续写时注入激活文风档案的特征描述
  imitationProfileId: string;    // 激活的文风档案 ID（空字符串=未选）
  modularWriting: boolean;       // 开启后每次 AI 续写的文字在编辑器中着色标记
}

// ── 写作块（模块化写作用） ────────────────────────────────────
// 记录每次 AI 续写插入的文字范围，用于在编辑器中渲染彩色背景
// 数据存在 useEditor 的 writingBlocks state 里（不持久化）
export interface WritingBlock {
  id: string;
  start: number;           // 在正文字符串中的起始下标（inclusive）
  end: number;             // 结束下标（exclusive），即 content.slice(start, end)
  colorIndex: number;      // 0–9 循环，由 BLOCK_COLORS 数组映射颜色
  generatedAt: number;
  styleProfileId?: string; // 使用的文风档案 ID（可选，用于溯源）
}

// ── 编辑器字体选项 ────────────────────────────────────────────
export const EDITOR_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '诺托宋体（默认）', value: "'Noto Serif SC', serif" },
  { label: '宋体 SimSun',      value: "'SimSun', '宋体', serif" },
  { label: '仿宋 FangSong',    value: "'FangSong', '仿宋', serif" },
  { label: '楷体 KaiTi',       value: "'KaiTi', '楷体', serif" },
  { label: '黑体 / 系统无衬线',  value: "'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { label: '等宽 Monospace',   value: "'Courier New', 'Consolas', monospace" },
];

// ── 书目 ──────────────────────────────────────────────────────
// 一本"书"是多个"草稿（章节）"的容器
// books 表存在 IndexedDB，由 useBooks.ts 管理
export interface Book {
  id: string;
  title: string;
  synopsis: string;      // 作品简介，用于大纲生成的上下文
  createdAt: number;
  updatedAt: number;
}

// ── 上下文压缩状态（DraftContextState） ──────────────────────
// 记录正文的压缩进度，在续写时由 contextCompression.ts 使用
// 持久化：存在 drafts 表的每个草稿记录里（useBooks 负责读写）
export interface DraftContextState {
  compactionCount: number;          // 已触发压缩的次数
  consecutiveCompactFailures: number; // 连续压缩失败次数（超3次自动禁用）
  compactDisabled: boolean;          // 是否已禁用压缩（连续失败保护）
  compactSummary: string;            // 最新的启发式摘要（<compact_summary>...）
  lastCompactedAt: number | null;    // 上次压缩时间戳
}

export const DEFAULT_DRAFT_CONTEXT_STATE: DraftContextState = {
  compactionCount: 0,
  consecutiveCompactFailures: 0,
  compactDisabled: false,
  compactSummary: '',
  lastCompactedAt: null,
};

// ── 编辑器状态快照（供 App.tsx 从 useEditor 解构） ────────────
export interface EditorState {
  content: string;
  isStreaming: boolean;
  isPolishing: boolean;
  error: string | null;
}

// ── 写作风格配置 ──────────────────────────────────────────────
// prompt 字段会被嵌入 systemInstruction，指导 AI 的写作风格
export interface StyleConfig {
  label: string;
  prompt: string;
  emoji: string;
}

export const STYLE_CONFIGS: Record<WritingStyle, StyleConfig> = {
  wuxia:   { label: '武侠', prompt: '以金庸古龙式武侠江湖笔法，侠气纵横', emoji: '⚔️' },
  romance: { label: '言情', prompt: '以细腻温柔的情感描写，缠绵悱恻', emoji: '🌸' },
  mystery: { label: '悬疑', prompt: '以紧张悬疑的笔法，层层推进，伏笔密布', emoji: '🔍' },
  scifi:   { label: '科幻', prompt: '以硬科幻世界观，逻辑严密，细节考究', emoji: '🚀' },
};

// ── 指令预设 ──────────────────────────────────────────────────
// 用户在 InstructionBar 保存的快速指令模板，存在 AppSettings 里
export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
}

// ── 设置迁移版本 ──────────────────────────────────────────────
// 每当 AppSettings 结构发生变更，需要在 settingsMigration.ts
// 中新增对应的迁移分支，并将此常量 +1
export const SETTINGS_SCHEMA_VERSION = 5;

// ── 默认设置 ──────────────────────────────────────────────────
// VITE_GEMINI_API_KEY / VITE_GEMINI_MODEL 可在 .env 文件预填，
// 方便开发时不用每次手动输入
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  apiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  style: 'romance',
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
