export type BeatFocus =
  | 'hook'
  | 'dialogue'
  | 'action'
  | 'emotion'
  | 'sensory'
  | 'suspense'
  | 'character_intro';

export interface Beat {
  id: string;
  description: string;
  targetWords: number;
  focus: BeatFocus;
  status: 'pending' | 'writing' | 'done';
  content?: string;
}

export const BEAT_FOCUS_META: Record<BeatFocus, { label: string; hint: string; color: string }> = {
  hook:           { label: '钩子',   color: '#f87171', hint: '开篇第一句必须抓住读者，制造强烈好奇心或悬念' },
  dialogue:       { label: '对话',   color: '#60a5fa', hint: '以对话推进矛盾，角色声线鲜明，潜台词丰富' },
  action:         { label: '动作',   color: '#fb923c', hint: '节奏快、画面感强，每个动作都有后果' },
  emotion:        { label: '情绪',   color: '#c084fc', hint: '深挖角色内心，情绪要具体可感，避免空洞' },
  sensory:        { label: '感官',   color: '#34d399', hint: '调动视觉/听觉/嗅觉，在读者脑中建立具体场景' },
  suspense:       { label: '悬念',   color: '#fbbf24', hint: '埋下未解的问题，让读者欲罢不能' },
  character_intro:{ label: '登场',   color: '#f472b6', hint: '用行为和细节刻画角色，而非直接描述' },
};
