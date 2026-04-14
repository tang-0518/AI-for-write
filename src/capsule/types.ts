// =============================================================
// capsule/types.ts — 角色胶囊类型定义
//
// 【设计目的】
//   角色胶囊是每个角色的"技能卡"：个体深度数据的独立容器。
//   知识图谱负责角色间的关系结构（薄），胶囊负责角色内部的细节（深）。
//
// 【与记忆宫殿的分工】
//   MemoryEntry{type:'character'} → 废弃，迁移到 CharacterCapsule
//   MemoryEntry{type:'world_rule'} → 保留在记忆宫殿（世界规则不属于任何角色）
//   MemoryEntry{type:'chapter_summary'} → 保留（时序上下文）
//   CharacterCapsule → 角色专属，按需加载，不常驻内存
//
// 【与知识图谱的关联】
//   CharacterCapsule.id 对应图谱中 NovelEntity.id（通过 name 匹配）
//   图谱节点只存 {id, name, type}，其余细节全在胶囊里
// =============================================================

export interface CapsuleCurrentState {
  chapter:    number;     // 最后更新时的章节序号
  goal:       string;     // 当前目标（可随章节变化）
  mood:       string;     // 情绪状态：平静 / 压抑 / 崩溃 / 振奋…
  powerLevel: string;     // 能力/状态描述
  knownFacts: string[];   // 已知的关键信息（影响角色决策）
  secrets:    string[];   // 仍在隐瞒的秘密
}

export interface CharacterCapsule {
  id:         string;
  bookId:     string;
  name:       string;
  color:      string;     // 角色主题色（用于图谱节点、标签）

  // ── 静态核心（基本不随剧情变化）────────────────────────
  identity:    string;    // 一句话身份："19岁男生，冰系觉醒者，身世成谜"
  backstory:   string;    // 背景故事（详细，不注入 prompt）
  personality: string;    // 性格特征（自然语言描述）
  voice:       string;    // 说话风格（用于写对话时注入）
  appearance:  string;    // 外貌描述（可选）

  // ── 动态状态（随章节更新）──────────────────────────────
  currentState: CapsuleCurrentState;

  // ── AI 注入用（自动维护，勿手动修改）───────────────────
  promptSnippet:  string;  // 压缩后注入 prompt 的文本，~100-200 token
  tokenEstimate:  number;  // promptSnippet 的 token 估算

  // ── 元数据 ───────────────────────────────────────────────
  updatedAt:      number;
  createdAt:      number;
  autoExtracted:  boolean;  // 是否由 AI 自动生成
  sourceMemoryId?: string;  // 迁移时记录来源 MemoryEntry.id
}

// 新建胶囊时的默认值
export const DEFAULT_CAPSULE_STATE: CapsuleCurrentState = {
  chapter:    0,
  goal:       '',
  mood:       '',
  powerLevel: '',
  knownFacts: [],
  secrets:    [],
};

// 角色预设颜色池（与图谱 META 颜色对应）
export const CAPSULE_COLORS = [
  '#f87171', // 红
  '#fb923c', // 橙
  '#fbbf24', // 黄
  '#34d399', // 绿
  '#60a5fa', // 蓝
  '#a78bfa', // 紫
  '#f472b6', // 粉
  '#94a3b8', // 灰
] as const;

export type CapsuleColor = typeof CAPSULE_COLORS[number];
