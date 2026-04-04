// =============================================================
// memory/types.ts — 记忆系统类型定义（参照 Claude Code memdir）
// =============================================================

export type MemoryType = 'user' | 'project' | 'feedback' | 'reference';

export interface MemoryEntry {
  id: string;
  name: string;          // 简短标题
  description: string;   // 一行摘要（显示在索引中）
  type: MemoryType;
  content: string;       // 完整内容
  updatedAt: number;     // Unix ms
}

export const MEMORY_TYPE_META: Record<MemoryType, { label: string; desc: string; color: string }> = {
  user:      { label: '用户',  desc: '用户角色、目标、偏好',          color: '#a78bfa' },
  project:   { label: '项目',  desc: '当前故事情节、人物、世界观',    color: '#34d399' },
  feedback:  { label: '反馈',  desc: '写作风格要求、需要避免的问题',  color: '#fbbf24' },
  reference: { label: '参考',  desc: '重要设定细节、地名、专有名词',  color: '#60a5fa' },
};
