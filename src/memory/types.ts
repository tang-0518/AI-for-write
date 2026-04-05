// =============================================================
// memory/types.ts — 记忆系统类型定义（参照 Claude Code memdir）
// =============================================================

export type MemoryType = 'user' | 'project' | 'feedback' | 'reference';

/** 七个真相文件类型（每本书维护一套） */
export type TruthFileType =
  | 'current_state'    // 世界状态：角色位置、关系网络、已知信息、情感弧线
  | 'particle_ledger'  // 资源账本：物品、金钱、物资数量
  | 'pending_hooks'    // 未闭合伏笔：铺垫、承诺、未解决冲突
  | 'character_web'    // 人物网络：主要角色性格、动机、人际关系
  | 'world_rules'      // 世界规则：魔法/科技/社会规则等设定
  | 'foreshadow_log'   // 伏笔记录：已埋伏笔与计划兑现节点
  | 'pov_voice';       // 视角语声：叙事视角、语气风格、叙述距离

export const TRUTH_FILE_META: Record<TruthFileType, { name: string; description: string }> = {
  current_state:   { name: '世界状态',   description: '角色位置、关系网络、已知信息、情感弧线' },
  particle_ledger: { name: '资源账本',   description: '物品、金钱、物资数量及衰减追踪' },
  pending_hooks:   { name: '未闭合伏笔', description: '铺垫、对读者的承诺、未解决冲突' },
  character_web:   { name: '人物网络',   description: '主要角色性格、动机、人际关系' },
  world_rules:     { name: '世界规则',   description: '魔法/科技/社会规则等核心设定' },
  foreshadow_log:  { name: '伏笔记录',   description: '已埋伏笔与计划兑现节点' },
  pov_voice:       { name: '视角语声',   description: '叙事视角、语气风格、叙述距离' },
};

export interface MemoryEntry {
  id: string;
  name: string;          // 简短标题
  description: string;   // 一行摘要（显示在索引中）
  type: MemoryType;
  content: string;       // 完整内容
  updatedAt: number;     // Unix ms
  bookId?: string;       // 关联书目（truth files 需要）
  truthFileType?: TruthFileType; // 设置后表示这是真相文件
}

export const MEMORY_TYPE_META: Record<MemoryType, { label: string; desc: string; color: string }> = {
  user:      { label: '用户',  desc: '用户角色、目标、偏好',          color: '#a78bfa' },
  project:   { label: '项目',  desc: '当前故事情节、人物、世界观',    color: '#34d399' },
  feedback:  { label: '反馈',  desc: '写作风格要求、需要避免的问题',  color: '#fbbf24' },
  reference: { label: '参考',  desc: '重要设定细节、地名、专有名词',  color: '#60a5fa' },
};
