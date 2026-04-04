import type { AppSettings, DraftContextState, WriteLength } from '../types';
import { DEFAULT_DRAFT_CONTEXT_STATE } from '../types';
import { estimateTokens } from './cache';

const TRIGGER_RATIO = 0.85;
const KEEP_RECENT_PARAGRAPHS = 10;
const MAX_CONSECUTIVE_FAILURES = 3;

function contextWindowForModel(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('gemini-2.5-pro')) return 200_000;
  if (m.includes('gemini-2.5-flash')) return 200_000;
  if (m.includes('gemini-1.5-pro')) return 128_000;
  if (m.includes('gemini-1.5-flash')) return 128_000;
  return 128_000;
}

function reservedOutputTokens(writeLength: WriteLength): number {
  if (writeLength === 'short') return 1500;
  if (writeLength === 'long') return 6000;
  return 3000;
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n{1,}/)
    .map(p => p.trim())
    .filter(Boolean);
}

// 按句子标点智能截断，而非硬截字符
function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  // 从截断点向前找最近的句尾标点
  const match = truncated.match(/^([\s\S]*[。！？；…])/);
  if (match && match[1].length >= maxChars * 0.5) return match[1];
  // 没找到句尾则退而求其次找逗号
  const commaMatch = truncated.match(/^([\s\S]*[，、])/);
  if (commaMatch && commaMatch[1].length >= maxChars * 0.4) return commaMatch[1] + '…';
  return truncated + '…';
}

// 从段落中提取潜在人物名（2-4字，出现在对话引导或动作描述前）
function extractCharacterNames(paragraphs: string[]): string[] {
  const text = paragraphs.join('');
  // 匹配"XX说/道/想/问/答/笑"等动作描述前的2-4字短名
  const namePattern = /[\u4e00-\u9fff]{2,4}(?:说道?|低声|大声|轻声|笑道?|皱眉|叹道?|问道?|答道?|冷声|怒道?|喝道?)/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = namePattern.exec(text)) !== null) {
    // 提取动作词前的人名部分
    const action = m[0].match(/([\u4e00-\u9fff]{2,4})(说道?|低声|大声|轻声|笑道?|皱眉|叹道?|问道?|答道?|冷声|怒道?|喝道?)/);
    if (action) names.add(action[1]);
  }
  return Array.from(names).slice(0, 6);
}

// 提取上次摘要中的剧情主线（用于累积）
function extractPrevPlotLine(prevSummary: string): string {
  const match = prevSummary.match(/\[剧情主线\]\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : '';
}

function buildHeuristicSummary(paragraphs: string[], prevSummary = ''): string {
  if (paragraphs.length === 0) return '';

  const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);

  // 采样：头部 3 段、中间 2 段、尾部 3 段，按标点智能截断到 120 字
  const leadSnippets = paragraphs.slice(0, 3).map(p => smartTruncate(p, 120)).filter(Boolean);
  const midStart = Math.max(0, Math.floor(paragraphs.length / 2) - 1);
  const midSnippets = paragraphs.slice(midStart, midStart + 2).map(p => smartTruncate(p, 100)).filter(Boolean);
  const tailSnippets = paragraphs.slice(-3).map(p => smartTruncate(p, 120)).filter(Boolean);

  const unique = Array.from(new Set([...leadSnippets, ...midSnippets, ...tailSnippets]));
  if (unique.length === 0) return '';

  // 人物名提取
  const chars = extractCharacterNames(paragraphs);
  const charLine = chars.length > 0 ? chars.join('、') : '延续前文角色';

  // 累积上一次摘要的剧情主线
  const prevPlot = prevSummary ? extractPrevPlotLine(prevSummary) : '';
  const plotLine = prevPlot
    ? `（前情）${prevPlot}；（本段）${unique.slice(0, 2).join('；')}`
    : unique.slice(0, 3).join('；');

  return [
    '<compact_summary>',
    `[剧情主线] ${plotLine}`,
    `[角色状态变化] 主要人物：${charLine}；${unique.slice(3, 5).join('；') || '维持前文角色目标与冲突'}`,
    `[伏笔与未回收线索] ${unique.slice(5, 7).join('；') || '保持前文伏笔未回收状态'}`,
    `[世界规则/设定约束] 已压缩正文约 ${paragraphs.length} 段（约 ${totalChars} 字），续写须遵循既有设定。`,
    `[下一段必须承接点] 与保留的尾段无缝衔接，不重述已发生事件。`,
    '</compact_summary>',
  ].join('\n');
}

function ensureState(state?: DraftContextState): DraftContextState {
  return state ?? DEFAULT_DRAFT_CONTEXT_STATE;
}

function markFailure(state: DraftContextState): DraftContextState {
  const failures = state.consecutiveCompactFailures + 1;
  return {
    ...state,
    consecutiveCompactFailures: failures,
    compactDisabled: failures >= MAX_CONSECUTIVE_FAILURES ? true : state.compactDisabled,
  };
}

function compactMemoryContext(memoryContext: string, compactSummary: string): string {
  if (!compactSummary.trim()) return memoryContext;
  if (!memoryContext.trim()) return compactSummary;
  return `${memoryContext}\n${compactSummary}`;
}

export function buildMemoryContextWithCompact(memoryContext: string, state?: DraftContextState): string {
  const s = ensureState(state);
  return compactMemoryContext(memoryContext, s.compactSummary);
}

export function maybeCompactForContinue(params: {
  content: string;
  memoryContext: string;
  oneTimePrompt: string;
  settings: AppSettings;
  state?: DraftContextState;
}): {
  contentForPrompt: string;
  memoryContextForPrompt: string;
  nextState: DraftContextState;
  compacted: boolean;
} {
  const baseState = ensureState(params.state);
  const memoryWithExisting = compactMemoryContext(params.memoryContext, baseState.compactSummary);

  if (baseState.compactDisabled) {
    return {
      contentForPrompt: params.content,
      memoryContextForPrompt: memoryWithExisting,
      nextState: baseState,
      compacted: false,
    };
  }

  const modelWindow = contextWindowForModel(params.settings.model);
  const inputBudget = modelWindow - reservedOutputTokens(params.settings.writeLength);
  const triggerRatio = params.settings.compactTriggerRatio ?? TRIGGER_RATIO;

  const estimatedInput =
    estimateTokens(params.content) +
    estimateTokens(memoryWithExisting) +
    estimateTokens(params.oneTimePrompt);

  if (estimatedInput < Math.floor(inputBudget * triggerRatio)) {
    return {
      contentForPrompt: params.content,
      memoryContextForPrompt: memoryWithExisting,
      nextState: baseState,
      compacted: false,
    };
  }

  try {
    const paragraphs = splitParagraphs(params.content);
    if (paragraphs.length <= KEEP_RECENT_PARAGRAPHS + 2) {
      return {
        contentForPrompt: params.content,
        memoryContextForPrompt: memoryWithExisting,
        nextState: baseState,
        compacted: false,
      };
    }

    const head = paragraphs.slice(0, paragraphs.length - KEEP_RECENT_PARAGRAPHS);
    const tail = paragraphs.slice(-KEEP_RECENT_PARAGRAPHS).join('\n\n');

    // 将旧摘要传入以实现累积，而非覆盖
    const summary = buildHeuristicSummary(head, baseState.compactSummary);

    if (!summary.trim()) {
      return { contentForPrompt: params.content, memoryContextForPrompt: memoryWithExisting, nextState: markFailure(baseState), compacted: false };
    }

    const successState: DraftContextState = {
      ...baseState,
      compactionCount: baseState.compactionCount + 1,
      consecutiveCompactFailures: 0,
      compactDisabled: false,
      compactSummary: summary,
      lastCompactedAt: Date.now(),
    };

    const mergedMemory = compactMemoryContext(params.memoryContext, summary);

    return {
      contentForPrompt: tail,
      memoryContextForPrompt: mergedMemory,
      nextState: successState,
      compacted: true,
    };
  } catch {
    return {
      contentForPrompt: params.content,
      memoryContextForPrompt: memoryWithExisting,
      nextState: markFailure(baseState),
      compacted: false,
    };
  }
}
