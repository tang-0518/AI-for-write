// =============================================================
// utils/aiDetection.ts — 去AI化检测工具
// 概念来源：InkOS anti-detect 模式（词汇指纹 + 疲劳词检测）
// =============================================================

export interface AiDetectionMatch {
  phrase: string;
  pattern: string;       // 模式类别描述
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface AiDetectionResult {
  score: number;           // 0=人类感 最强, 100=AI味 最重
  level: 'low' | 'medium' | 'high' | 'very-high';
  matches: AiDetectionMatch[];
  matchCount: number;
  totalWords: number;
}

// 高频 AI 写作特征模式（中文小说场景）
const AI_PATTERNS: Array<{
  regex: RegExp;
  pattern: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}> = [
  // 高危：模板化句式
  { regex: /随着[^，。！？\n]{0,20}的[^，。！？\n]{0,10}[，,][^。！？\n]{0,30}(越来越|愈发|更加)/g, pattern: '模板句式：随着X的Y，Z越来越W', severity: 'high', suggestion: '拆解为具体动作与感受，避免抽象归纳' },
  { regex: /不知(为何|为什么)[，,]?/g, pattern: '廉价过渡：不知为何', severity: 'high', suggestion: '直接描写情绪或动作，无需解释' },
  { regex: /某种(奇怪|莫名|难以言说)的[^，。！？\n]{0,15}(感觉|情绪|感受)/g, pattern: '模糊情绪：某种奇怪的感觉', severity: 'high', suggestion: '用具体的生理/动作细节代替' },
  { regex: /仿佛[^。！？\n]{0,30}一般/g, pattern: '套式比喻：仿佛……一般', severity: 'medium', suggestion: '换用更新鲜的比喻或直接陈述' },

  // 中危：高频副词
  { regex: /渐渐地?[，,]?/g, pattern: 'AI高频副词：渐渐', severity: 'medium', suggestion: '改用具体过程描写，或直接省略' },
  { regex: /不禁[，,]?/g, pattern: 'AI高频副词：不禁', severity: 'medium', suggestion: '直接写动作反应即可' },
  { regex: /顿时[，,]?/g, pattern: 'AI高频副词：顿时', severity: 'medium', suggestion: '省略或改用短句节奏表达突然感' },
  { regex: /猛然间?[，,]?/g, pattern: 'AI高频副词：猛然', severity: 'medium', suggestion: '改为短促句，通过断句制造节奏' },
  { regex: /霎时(间)?[，,]?/g, pattern: 'AI高频副词：霎时', severity: 'medium', suggestion: '省略或改写为动词直接动作' },
  { regex: /心中(不禁|顿时|猛然)/g, pattern: 'AI模板：心中+副词', severity: 'medium', suggestion: '直接写心理动词或行为反应' },

  // 中危：廉价过渡
  { regex: /就在这时[，,]?/g, pattern: '廉价过渡：就在这时', severity: 'medium', suggestion: '直接起笔写新事件' },
  { regex: /突然(间)?[，,]?/g, pattern: '廉价过渡：突然', severity: 'medium', suggestion: '短句冲击更有力，省略"突然"' },
  { regex: /与此同时[，,]?/g, pattern: '廉价过渡：与此同时', severity: 'medium', suggestion: '用场景切换或段落分隔代替' },
  { regex: /话音刚落[，,]?/g, pattern: '廉价过渡：话音刚落', severity: 'medium', suggestion: '去掉过渡，直接写下一个动作' },

  // 低危：过度对仗/排比
  { regex: /[^。！？\n]{5,20}[，,]而[^。！？\n]{5,20}[，,]([^。！？\n]{5,20}[，,]而)?/g, pattern: '过度对仗：X，而Y，而Z', severity: 'low', suggestion: '适当保留一组，其余改为散句' },
  { regex: /(既|不仅)[^，。！？\n]{2,15}[，,](也|又|更|还)[^，。！？\n]{2,15}/g, pattern: '套式递进：既…也…', severity: 'low', suggestion: '根据实际语义判断是否需要递进关系' },

  // 低危：说教腔
  { regex: /这一刻[，,]?他(终于|深深地)?明白了?/g, pattern: '顿悟模板：这一刻他明白了', severity: 'low', suggestion: '用行动或细节暗示领悟，避免点明' },
  { regex: /内心深处[^，。！？\n]{0,20}(升起|涌起|燃起)/g, pattern: 'AI腔：内心深处X起', severity: 'low', suggestion: '用身体感受或具体动作代替' },
];

/** 检测文本的AI特征，返回检测结果 */
export function detectAiPatterns(text: string): AiDetectionResult {
  if (!text.trim()) {
    return { score: 0, level: 'low', matches: [], matchCount: 0, totalWords: 0 };
  }

  const totalWords = text.replace(/\s/g, '').length;
  const matchMap = new Map<string, AiDetectionMatch>();

  for (const pat of AI_PATTERNS) {
    // 重置 lastIndex（全局 regex 需要）
    pat.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(text)) !== null) {
      const phrase = m[0];
      const key = `${pat.pattern}:${phrase}`;
      if (!matchMap.has(key)) {
        matchMap.set(key, {
          phrase,
          pattern: pat.pattern,
          severity: pat.severity,
          suggestion: pat.suggestion,
        });
      }
    }
  }

  const matches = Array.from(matchMap.values()).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });

  // 计算得分：高=10分, 中=5分, 低=2分，归一化到 0-100
  const rawScore = matches.reduce((s, m) => {
    return s + (m.severity === 'high' ? 10 : m.severity === 'medium' ? 5 : 2);
  }, 0);

  // 按每千字归一化，上限100
  const density = (rawScore / Math.max(totalWords, 1)) * 1000;
  const score = Math.min(100, Math.round(density * 2));

  const level: AiDetectionResult['level'] =
    score >= 60 ? 'very-high' :
    score >= 35 ? 'high' :
    score >= 15 ? 'medium' : 'low';

  return { score, level, matches, matchCount: matches.length, totalWords };
}

export const AI_LEVEL_META: Record<AiDetectionResult['level'], { label: string; color: string; desc: string }> = {
  'low':       { label: '人类感强', color: '#34d399', desc: '文字自然，AI特征极少' },
  'medium':    { label: '轻度AI味', color: '#fbbf24', desc: '存在少量AI惯用句式，可适当调整' },
  'high':      { label: '明显AI味', color: '#f97316', desc: '多处AI模板，建议用"去AI化"润色' },
  'very-high': { label: 'AI特征显著', color: '#f87171', desc: 'AI痕迹较重，强烈建议润色处理' },
};
