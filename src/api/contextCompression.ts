// =============================================================
// api/contextCompression.ts — 正文上下文压缩（长文处理）
//
// 【解决的问题】
//   小说写到数万字时，把全文都放进 Prompt 会消耗大量 token，
//   甚至超出模型上下文窗口限制（Gemini 虽有 1M token，但输入越长越贵）。
//
// 【压缩策略】
//   当正文 token 数超过上下文窗口的 85%（compactTriggerRatio）时：
//   1. 把"头部段落"（保留最近 10 段之前的所有段落）提炼为启发式摘要
//   2. 把"摘要 + 最近10段"作为新的正文输入给 Gemini
//   3. 原始正文保持不变（只影响发给 AI 的内容，不影响编辑器显示）
//
// 【启发式摘要（非 AI 生成）】
//   摘要由本地算法生成，不调用 API，速度快且零 token 消耗。
//   包含：剧情主线、角色状态、伏笔标记。
//
// 【状态持久化】
//   压缩状态（DraftContextState）存在每个草稿记录里，
//   由 useBooks.ts 读写，通过 useEditor 的 draftContextState 参数传入。
//
// 【被哪些文件使用】
//   hooks/useEditor.ts — continueWriting() 调用 maybeCompactForContinue()
//   hooks/useEditor.ts — polish() 调用 buildMemoryContextWithCompact()
// =============================================================

import type { AppSettings, DraftContextState, WriteLength } from '../types';
import { DEFAULT_DRAFT_CONTEXT_STATE } from '../types';
import { estimateTokens } from './cache';

// 正文使用量超过上下文窗口 85% 时触发压缩
const TRIGGER_RATIO = 0.85;
// 压缩后保留最近的 N 段（保证续写的连贯性）
const KEEP_RECENT_PARAGRAPHS = 10;
// 连续压缩失败超过此次数时自动禁用压缩（防止无限循环）
const MAX_CONSECUTIVE_FAILURES = 3;

// ── 各模型的上下文窗口大小（tokens） ─────────────────────────
function contextWindowForModel(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('gemini-2.5-pro'))   return 1_048_576;  // 1M context
  if (m.includes('gemini-2.5-flash')) return 1_048_576;  // 1M context
  if (m.includes('gemini-1.5-pro'))   return 2_097_152;  // 2M context
  if (m.includes('gemini-1.5-flash')) return 1_048_576;  // 1M context
  return 1_048_576;
}

// 为 AI 输出预留的 token 数（不能全部用于输入）
function reservedOutputTokens(writeLength: WriteLength): number {
  if (writeLength === 'short') return 2000;
  if (writeLength === 'long') return 10000;
  return 4500;  // medium
}

// 按空行分段（中文小说的自然分段方式）
function splitParagraphs(content: string): string[] {
  return content
    .split(/\n{1,}/)
    .map(p => p.trim())
    .filter(Boolean);
}

// 智能截断：优先在句尾标点处截断，避免截断在句子中间
function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  // 从截断点向前找最近的句尾标点（贪婪匹配最长的合法截断点）
  const match = truncated.match(/^([\s\S]*[。！？；…])/);
  if (match && match[1].length >= maxChars * 0.5) return match[1];
  // 没找到句尾则退而求其次找逗号
  const commaMatch = truncated.match(/^([\s\S]*[，、])/);
  if (commaMatch && commaMatch[1].length >= maxChars * 0.4) return commaMatch[1] + '…';
  return truncated + '…';
}

// ── 人物名提取 ────────────────────────────────────────────────
// 从文本中识别"XX说""XX笑道"等模式前的人物名，用于摘要中标注角色状态
function extractCharacterNames(paragraphs: string[]): string[] {
  const text = paragraphs.join('');
  // 匹配"XX说/道/想/问/答/笑"等动作前的 2-4 字短名
  const namePattern = /[\u4e00-\u9fff]{2,4}(?:说道?|低声|大声|轻声|笑道?|皱眉|叹道?|问道?|答道?|冷声|怒道?|喝道?)/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = namePattern.exec(text)) !== null) {
    const action = m[0].match(/([\u4e00-\u9fff]{2,4})(说道?|低声|大声|轻声|笑道?|皱眉|叹道?|问道?|答道?|冷声|怒道?|喝道?)/);
    if (action) names.add(action[1]);
  }
  return Array.from(names).slice(0, 6); // 最多取6个角色名，避免摘要过长
}

// 从上次摘要中提取剧情主线，用于累积（新摘要 = 前情 + 本段摘要）
function extractPrevPlotLine(prevSummary: string): string {
  const match = prevSummary.match(/\[剧情主线\]\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : '';
}

// ── 启发式摘要生成 ────────────────────────────────────────────
// 不调用 AI，纯本地算法。策略：采样头/中/尾代表性段落，拼接成摘要。
// 摘要包裹在 <compact_summary> 标签中，方便后续在 gemini.ts 里用正则提取
function buildHeuristicSummary(paragraphs: string[], prevSummary = ''): string {
  if (paragraphs.length === 0) return '';

  const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);

  // 采样策略：头部3段（交代背景）+ 中部2段（剧情发展）+ 尾部3段（最新进展）
  const leadSnippets = paragraphs.slice(0, 3).map(p => smartTruncate(p, 120)).filter(Boolean);
  const midStart = Math.max(0, Math.floor(paragraphs.length / 2) - 1);
  const midSnippets = paragraphs.slice(midStart, midStart + 2).map(p => smartTruncate(p, 100)).filter(Boolean);
  const tailSnippets = paragraphs.slice(-3).map(p => smartTruncate(p, 120)).filter(Boolean);

  // 去重（头/中/尾可能有重叠）
  const unique = Array.from(new Set([...leadSnippets, ...midSnippets, ...tailSnippets]));
  if (unique.length === 0) return '';

  const chars = extractCharacterNames(paragraphs);
  const charLine = chars.length > 0 ? chars.join('、') : '延续前文角色';

  // 累积式摘要：把上次的剧情主线延续到本次，而不是每次覆盖
  // 这样多次压缩后，摘要仍能追溯到很早的情节
  const prevPlot = prevSummary ? extractPrevPlotLine(prevSummary) : '';
  const plotLine = prevPlot
    ? `（前情）${prevPlot}；（本段）${unique.slice(0, 2).join('；')}`
    : unique.slice(0, 3).join('；');

  // 摘要格式：5个区段，AI 续写时会把这段当作"已知背景"来理解
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

// ── DraftContextState 辅助函数 ────────────────────────────────

function ensureState(state?: DraftContextState): DraftContextState {
  return state ?? DEFAULT_DRAFT_CONTEXT_STATE;
}

// 记录压缩失败，超过阈值后自动禁用
function markFailure(state: DraftContextState): DraftContextState {
  const failures = state.consecutiveCompactFailures + 1;
  return {
    ...state,
    consecutiveCompactFailures: failures,
    compactDisabled: failures >= MAX_CONSECUTIVE_FAILURES ? true : state.compactDisabled,
  };
}

// 将记忆上下文和压缩摘要合并（摘要附在记忆后面）
function compactMemoryContext(memoryContext: string, compactSummary: string): string {
  if (!compactSummary.trim()) return memoryContext;
  if (!memoryContext.trim()) return compactSummary;
  return `${memoryContext}\n${compactSummary}`;
}

// ── 对外导出：为续写构建带摘要的记忆上下文 ─────────────────
// 供 useEditor.ts 的 polish() 使用（润色不需要压缩正文，只需附加摘要）
export function buildMemoryContextWithCompact(memoryContext: string, state?: DraftContextState): string {
  const s = ensureState(state);
  return compactMemoryContext(memoryContext, s.compactSummary);
}

// ── 核心导出：判断是否需要压缩，返回发给 AI 的内容 ──────────
//
// 调用时机：每次 continueWriting() 开始时调用一次。
// 返回值：
//   contentForPrompt    — 发给 Gemini 的正文（可能是压缩后的尾段）
//   memoryContextForPrompt — 发给 Gemini 的记忆（含摘要）
//   nextState           — 新的压缩状态（由调用方持久化到 IndexedDB）
//   compacted           — 是否发生了压缩（用于调试）
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
  // 合并已有记忆和上次的压缩摘要
  const memoryWithExisting = compactMemoryContext(params.memoryContext, baseState.compactSummary);

  // 压缩被禁用（连续失败保护）→ 直接返回原始内容
  if (baseState.compactDisabled) {
    return {
      contentForPrompt: params.content,
      memoryContextForPrompt: memoryWithExisting,
      nextState: baseState,
      compacted: false,
    };
  }

  // 计算当前估算输入 token 数
  const modelWindow = contextWindowForModel(params.settings.model);
  const inputBudget = modelWindow - reservedOutputTokens(params.settings.writeLength);
  const triggerRatio = params.settings.compactTriggerRatio ?? TRIGGER_RATIO;

  const estimatedInput =
    estimateTokens(params.content) +
    estimateTokens(memoryWithExisting) +
    estimateTokens(params.oneTimePrompt);

  // 未超过阈值 → 不压缩，直接用原始内容
  if (estimatedInput < Math.floor(inputBudget * triggerRatio)) {
    return {
      contentForPrompt: params.content,
      memoryContextForPrompt: memoryWithExisting,
      nextState: baseState,
      compacted: false,
    };
  }

  // ── 触发压缩 ──────────────────────────────────────────────
  try {
    const paragraphs = splitParagraphs(params.content);

    // 段落太少时不值得压缩（压缩后节省不了多少，风险大于收益）
    if (paragraphs.length <= KEEP_RECENT_PARAGRAPHS + 2) {
      return {
        contentForPrompt: params.content,
        memoryContextForPrompt: memoryWithExisting,
        nextState: baseState,
        compacted: false,
      };
    }

    // 头部段落 → 生成摘要；尾部段落 → 原样保留（保证续写连贯性）
    const head = paragraphs.slice(0, paragraphs.length - KEEP_RECENT_PARAGRAPHS);
    const tail = paragraphs.slice(-KEEP_RECENT_PARAGRAPHS).join('\n\n');

    // 把上次的摘要传入，实现累积式摘要（多次压缩不丢失早期情节）
    const summary = buildHeuristicSummary(head, baseState.compactSummary);

    if (!summary.trim()) {
      return { contentForPrompt: params.content, memoryContextForPrompt: memoryWithExisting, nextState: markFailure(baseState), compacted: false };
    }

    // 更新压缩状态（由调用方写回 IndexedDB）
    const successState: DraftContextState = {
      ...baseState,
      compactionCount: baseState.compactionCount + 1,
      consecutiveCompactFailures: 0,
      compactDisabled: false,
      compactSummary: summary,
      lastCompactedAt: Date.now(),
    };

    // 合并记忆 + 新摘要（摘要取代旧摘要，记忆不变）
    const mergedMemory = compactMemoryContext(params.memoryContext, summary);

    return {
      contentForPrompt: tail,        // 只发给 AI 最近的 N 段
      memoryContextForPrompt: mergedMemory,
      nextState: successState,
      compacted: true,
    };
  } catch {
    // 压缩失败（异常）→ 标记失败，返回原始内容
    return {
      contentForPrompt: params.content,
      memoryContextForPrompt: memoryWithExisting,
      nextState: markFailure(baseState),
      compacted: false,
    };
  }
}
