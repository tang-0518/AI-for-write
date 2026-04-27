import type { Beat, BeatFocus } from './types';
import { generateId } from '../utils/id';

const CONFLICT_TEMPLATE: Array<[BeatFocus, number, string]> = [
  ['sensory',   500, '冲突前的感官铺垫，渲染紧张气氛'],
  ['action',    800, '冲突正式爆发，矛盾激化'],
  ['emotion',   700, '角色情绪细节，内心与反应'],
  ['action',    500, '冲突结果与余波'],
];

const BATTLE_TEMPLATE: Array<[BeatFocus, number, string]> = [
  ['sensory',   400, '战前准备与氛围渲染'],
  ['action',    600, '第一回合交锋'],
  ['action',    700, '局势升级与转折'],
  ['action',    500, '关键转折点'],
  ['emotion',   300, '战后情绪落地'],
];

const REVELATION_TEMPLATE: Array<[BeatFocus, number, string]> = [
  ['suspense',  700, '线索汇聚，真相即将揭晓'],
  ['dialogue',  1000,'真相揭露场景，核心对话'],
  ['emotion',   800, '真相揭露后的情绪余波'],
];

const OPENING_CHAPTER_TEMPLATE: Array<[BeatFocus, number, string]> = [
  ['hook',           500, '开篇钩子，第一句话制造强悬念'],
  ['character_intro',1000,'主角登场，用行为定义人物'],
  ['sensory',        800, '世界观植入，感官建立场景'],
  ['suspense',       700, '结尾悬念，驱动读者翻页'],
];

const DEFAULT_TEMPLATE: Array<[BeatFocus, number, string]> = [
  ['sensory',   800, '场景开场，建立空间感'],
  ['action',    1200,'主要事件推进'],
  ['emotion',   500, '情绪收尾，为下章蓄力'],
];

const CONFLICT_KW   = ['争吵', '冲突', '质问', '对峙', '争论', '吵架', '指责', '怒斥'];
const BATTLE_KW     = ['战斗', '打斗', '对决', '交战', '厮杀', '搏斗', '比武', '决战'];
const REVELATION_KW = ['发现', '真相', '揭露', '揭秘', '知道了', '明白了', '查出', '暴露'];

export function magnifyOutlineToBeats(
  chapterNumber: number,
  outline: string,
  targetChapterWords = 3000,
): Beat[] {
  let template: Array<[BeatFocus, number, string]>;

  if (chapterNumber === 1) {
    template = OPENING_CHAPTER_TEMPLATE;
  } else if (chapterNumber === 2) {
    template = [
      ['dialogue',        800, '对话中揭示人物关系与世界背景'],
      ['action',         1200, '主线事件推进，确立第一个障碍'],
      ['emotion',         600, '角色面对障碍的情绪反应'],
      ['suspense',        400, '结尾悬念'],
    ];
  } else if (chapterNumber === 3) {
    template = [
      ['sensory',         600, '场景建立，承接上章悬念'],
      ['action',         1200, '高潮事件，冲突顶点'],
      ['emotion',         800, '情绪顶点与角色转变'],
      ['suspense',        400, '次级悬念为后续蓄力'],
    ];
  } else if (CONFLICT_KW.some(kw => outline.includes(kw))) {
    template = CONFLICT_TEMPLATE;
  } else if (BATTLE_KW.some(kw => outline.includes(kw))) {
    template = BATTLE_TEMPLATE;
  } else if (REVELATION_KW.some(kw => outline.includes(kw))) {
    template = REVELATION_TEMPLATE;
  } else {
    template = DEFAULT_TEMPLATE;
  }

  const rawTotal = template.reduce((s, [, w]) => s + w, 0);
  const scale = targetChapterWords / rawTotal;

  return template.map(([focus, rawWords, description]) => ({
    id: generateId(),
    description,
    targetWords: Math.round(rawWords * scale),
    focus,
    status: 'pending' as const,
  }));
}

export function buildBeatPrompt(beat: Beat, beatIndex: number, totalBeats: number): string {
  const focusHints: Record<BeatFocus, string> = {
    hook:           '第一句话必须制造强烈悬念或冲突，直接抓住读者',
    dialogue:       '以对话为核心推进，角色声线鲜明，每句台词都有潜台词',
    action:         '节奏快、画面感强，每个动作都有因果后果',
    emotion:        '深挖角色内心活动，情绪要具体可感，避免空洞形容词',
    sensory:        '调动视觉/听觉/嗅觉/触觉，让读者身临其境',
    suspense:       '埋下至少一个未解的问题，结尾不作答，驱动读者继续',
    character_intro:'用一个具体行为或习惯定义角色，而不是直接描写外貌',
  };

  const isFirst = beatIndex === 0;
  const isLast  = beatIndex === totalBeats - 1;

  const lines = [
    `【节拍 ${beatIndex + 1}/${totalBeats}】${beat.description}`,
    `目标字数：约 ${beat.targetWords} 字`,
    `聚焦要求：${focusHints[beat.focus]}`,
  ];

  if (!isFirst) lines.push('续接上段，不要重复已写内容，自然衔接。');
  if (isLast)   lines.push('本段为本章收尾，留下悬念或情绪落点，为下章蓄力。');

  lines.push('只输出本节拍的正文，不要章节标题，不要"节拍X"等提示语。');

  return lines.join('\n');
}
