// =============================================================
// config/constants.ts — 全局常量
// =============================================================

/** 上一章末尾用于上下文参考的字符数 */
export const PREV_CHAPTER_TAIL_CHARS = 400;

/** 页面关闭时用同步 localStorage 暂存当前草稿，启动后再回灌到 IndexedDB */
export const UNLOAD_BACKUP_STORAGE_KEY = 'novel-ai-unload-backup';

/** 模块化写作：10 种块颜色（明暗主题均可辨） */
export const BLOCK_COLORS = [
  'rgba(139,92,246,0.12)',   // purple
  'rgba(59,130,246,0.12)',   // blue
  'rgba(16,185,129,0.12)',   // emerald
  'rgba(245,158,11,0.12)',   // amber
  'rgba(239,68,68,0.12)',    // red
  'rgba(6,182,212,0.12)',    // cyan
  'rgba(168,85,247,0.12)',   // violet
  'rgba(234,179,8,0.12)',    // yellow
  'rgba(20,184,166,0.12)',   // teal
  'rgba(249,115,22,0.12)',   // orange
] as const;

/** 模块化写作：块边框色（更深一档） */
export const BLOCK_BORDER_COLORS = [
  'rgba(139,92,246,0.35)',
  'rgba(59,130,246,0.35)',
  'rgba(16,185,129,0.35)',
  'rgba(245,158,11,0.35)',
  'rgba(239,68,68,0.35)',
  'rgba(6,182,212,0.35)',
  'rgba(168,85,247,0.35)',
  'rgba(234,179,8,0.35)',
  'rgba(20,184,166,0.35)',
  'rgba(249,115,22,0.35)',
] as const;
