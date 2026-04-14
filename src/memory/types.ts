// =============================================================
// memory/types.ts — 记忆宫殿类型定义
//
// 三层记忆架构：
//   Layer 0  工作记忆（contextCompression，不在此管理）
//   Layer 1  章节摘要  chapter_summary — 每章完成后自动生成
//   Layer 2  书级实体  character / world_rule — 自动提取 + 可手动修正
//            用户笔记  note — 纯手动
// =============================================================

/** 记忆宫殿条目类型 */
export type MemoryType = 'character' | 'world_rule' | 'chapter_summary' | 'note';

export interface MemoryEntry {
  id: string;
  name: string;          // 简短标题（如角色名、规则名、章节名）
  description: string;   // 一行摘要
  type: MemoryType;
  content: string;       // 完整内容
  updatedAt: number;     // Unix ms
  bookId?: string;       // 关联书目（所有条目应绑定书目）
  autoExtracted?: boolean; // 是否由 AI 自动提取（可手动修正）
  chapterOrder?: number;   // 仅 chapter_summary 使用，章节序号
}

export const MEMORY_TYPE_META: Record<MemoryType, { label: string; desc: string; color: string; emoji: string }> = {
  character:       { label: '角色',     desc: '人物档案：性格、外貌、关系、当前状态', color: '#f87171', emoji: '👤' },
  world_rule:      { label: '世界设定', desc: '规则、魔法体系、历史背景、地理设定',   color: '#60a5fa', emoji: '🌍' },
  chapter_summary: { label: '章节摘要', desc: '已完成章节的情节摘要',                color: '#34d399', emoji: '📖' },
  note:            { label: '笔记',     desc: '作者自定义笔记、提醒、灵感',           color: '#fbbf24', emoji: '📝' },
};

// ── 情节钩子（独立功能，保持不变） ───────────────────────────────

export type PlotHookStatus = 'pending' | 'resolved' | 'deferred';
export type PlotHookPriority = 'high' | 'medium' | 'low';

export interface PlotHook {
  id: string;
  bookId: string;
  title: string;
  description: string;
  status: PlotHookStatus;
  priority: PlotHookPriority;
  chapterCreated?: string;
  chapterResolved?: string;
  createdAt: number;
  updatedAt: number;
}

export const PLOT_HOOK_STATUS_META: Record<PlotHookStatus, { label: string; color: string; emoji: string }> = {
  pending:  { label: '待解决', color: '#fbbf24', emoji: '⏳' },
  resolved: { label: '已解决', color: '#34d399', emoji: '✅' },
  deferred: { label: '已延期', color: '#94a3b8', emoji: '⏸️' },
};

export const PLOT_HOOK_PRIORITY_META: Record<PlotHookPriority, { label: string; color: string }> = {
  high:   { label: '高', color: '#f87171' },
  medium: { label: '中', color: '#fbbf24' },
  low:    { label: '低', color: '#94a3b8' },
};
