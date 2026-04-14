// =============================================================
// api/gemini.ts — Google Gemini API 封装
//
// 【职责】
//   所有与 Gemini API 的通信都在这里。包含续写、润色、摘要生成、
//   实体提取、大纲生成等功能。是整个 AI 功能的底层实现。
//
// 【被哪些文件使用】
//   hooks/useEditor.ts   — streamContinue, streamResume, polishText
//   hooks/useChapterComplete.ts — generateChapterSummary, extractChapterEntities
//   App.tsx              — checkConsistency, generateOutline, extractEntitiesFromAccepted
//   api/styleAnalysis.ts — callGemini（通用请求辅助）
//
// 【Prompt 架构设计】
//   Gemini API 支持将 Prompt 分为两部分：
//
//   systemInstruction（系统指令）：
//     - 角色定义、写作风格、输出规则
//     - 内容相对稳定，Gemini 服务端可缓存（节省 token）
//     - 约 ~120 tokens
//
//   user message（用户消息）：
//     - XML 结构化动态内容，每次续写都不同
//     - 包含：字数约束 + 记忆背景 + 正文尾段
//
// 【Token 预算（续写，总 input ≈ 2200 tokens）】
//   systemInstruction : ~120
//   <约束>            :  ~40
//   <背景/记忆>       : max 600
//   <背景/摘要>       : max 300
//   <背景/文风>       : max 150  (模仿模式)
//   <背景/指令>       : max  80
//   <前文/前章>       : max 150  (可选)
//   <前文/正文>       : ~700     (末尾 2200 chars)
//   XML 结构标签      :  ~60
//
// 【流式输出（SSE）】
//   续写和接着写使用 streamGenerateContent + SSE（Server-Sent Events），
//   每个 chunk 实时 yield 给 useEditor，实现渐进显示效果。
//   润色使用同样的 SSE 接口，但在内部收集完整结果后才返回。
// =============================================================

import type { AppSettings, WritingStyle, CreativityLevel, PolishMode } from '../types';
import { STYLE_CONFIGS, LENGTH_CONFIGS, CREATIVITY_CONFIGS } from '../types';
import { estimateTokens, getCache, makeCacheKey, setCache } from './cache';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CONTEXT_TAIL_CHARS = 2200;
// 单次润色文字字符数上限；超过此值按段落分块
const POLISH_CHUNK_CHARS = 2000;

/** 根据模型名返回安全的最大输出 token 数 */
function getModelMaxOutputTokens(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('2.5')) return 65_536;  // Gemini 2.5 Pro/Flash 实际上限
  if (m.includes('2.0')) return 8_192;
  return 8_192;                          // 1.5 及其他保守上限
}

/**
 * Gemini 2.5 Flash 系列默认开启 Thinking，thinking token 会消耗 maxOutputTokens
 * 配额，导致正文被截断。对续写/润色等创意任务禁用 thinking，把完整配额还给正文。
 *
 * 禁用规则（thinkingBudget: 0 仅对以下情况有效）：
 *   - Gemini 2.5 Flash（非 thinking 专用变体）
 *
 * 以下情况不可设 budget: 0，API 会返回 400 错误：
 *   - Gemini 2.5 Pro（强制开启 thinking，不可关闭）
 *   - 任何名称含 "thinking" 的模型（thinking-only 模型）
 */
export function withNoThinking(
  model: string,
  config: GeminiRequestConfig,
): GeminiRequestConfig {
  const m = model.toLowerCase();
  // 仅 Gemini 2.5 Flash（非 thinking 专用）支持 budget: 0
  if (m.includes('2.5') && m.includes('flash') && !m.includes('thinking')) {
    return { ...config, thinkingConfig: { thinkingBudget: 0 } };
  }
  return config;
}

const staticPromptCache = new Map<string, string>();

/** 续写/接着写命中 MAX_TOKENS 时在 generator 内部 yield 的哨兵值（非用户可见文本） */
export const TRUNCATION_SENTINEL = '\x00TRUNCATED';

// 将 HTTP 错误响应转为用户友好的中文消息（保留真实 API 错误细节）
async function toFriendlyError(response: Response): Promise<Error> {
  let apiDetail = '';
  try {
    const body = await response.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const msg = (parsed?.error as Record<string, unknown>)?.message as string | undefined;
    if (msg) apiDetail = ` — ${msg}`;
  } catch { /* ignore */ }
  const s = response.status;
  if (s === 400) return new Error(`请求参数有误，请检查模型名称与设置${apiDetail}`);
  if (s === 401 || s === 403) return new Error('API Key 无效或无权限，请在设置中重新填写');
  if (s === 404) return new Error('模型不存在或名称有误，请在设置中更正模型名称');
  if (s === 429) return new Error('请求太频繁，请稍候再试（超出 API 速率限制）');
  if (s === 502 || s === 503) return new Error('Gemini 服务暂时不可用，请稍后重试');
  if (s >= 500) return new Error('Gemini 服务器内部错误，请稍后重试');
  return new Error(`请求失败（HTTP ${s}）${apiDetail}`);
}

// 公共 JSON 请求辅助，避免重复 fetch 样板
interface GeminiRequestConfig {
  temperature: number;
  maxOutputTokens: number;
  [key: string]: unknown;   // 允许 thinkingConfig 等扩展字段
}
export async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  config: GeminiRequestConfig,
): Promise<string> {
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: config,
    }),
  });
  if (!response.ok) throw await toFriendlyError(response);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as Record<string, any>;
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? '';
}

// JSON 数组安全解析
export function parseJsonArray<T>(raw: string): T[] {
  try {
    // 先去掉 Gemini 有时会加的 markdown 代码块标记
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    // 尝试直接解析
    if (cleaned.startsWith('[')) {
      return JSON.parse(cleaned) as T[];
    }
    // 退而求其次：用正则提取第一个 JSON 数组
    const match = cleaned.match(/\[[\s\S]*\]/);
    return match ? (JSON.parse(match[0]) as T[]) : [];
  } catch { return []; }
}

// JSON 对象安全解析
export function parseJsonObject(raw: string): Record<string, string> {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as Record<string, string>) : {};
  } catch { return {}; }
}

// 超过 150 字的长指令自动截断，保留最重要的规则（节省 token）
function compressInstruction(customPrompt: string): string {
  const trimmed = customPrompt.trim();
  if (!trimmed || trimmed.length <= 150) return trimmed;
  // 按分号/句号切割，取前 N 条规则
  const rules = trimmed.split(/[；;。\n]/).map(r => r.trim()).filter(Boolean);
  let compressed = '';
  for (const rule of rules) {
    if ((compressed + rule).length > 140) break;
    compressed += (compressed ? '；' : '') + rule;
  }
  return compressed || trimmed.slice(0, 140) + '…';
}

// ── token 预算截断辅助 ────────────────────────────────────────

/** 按 token 预算截断字符串（1 token ≈ 1.8 中文字符）*/
function budgetTruncate(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * 1.8);
  if (text.length <= maxChars) return text;
  // 尝试在句末截断
  const cut = text.slice(0, maxChars);
  const lastPunct = cut.lastIndexOf('。');
  return lastPunct > maxChars * 0.6 ? cut.slice(0, lastPunct + 1) + '…' : cut + '…';
}

// ── System Instruction 构建（角色 + 不变规则，可被 Gemini 缓存） ───

/**
 * 构建 systemInstruction 文本。
 * 包含：角色定义、风格指令、用户自定义规则、输出硬约束。
 * 控制在 ~120 tokens，避免浪费缓存配额。
 */
function buildSystemInstruction(style: WritingStyle, customPrompt: string): string {
  const compressed = compressInstruction(customPrompt);
  const key = `sys:${style}:${compressed}`;
  const hit = staticPromptCache.get(key);
  if (hit) return hit;

  const { prompt } = STYLE_CONFIGS[style];
  const lines = [
    `你是一位卓越的中文小说作家，请${prompt}续写正文。`,
    `输出规则：①直接输出正文，无标题无说明；②不重复已有内容；③保持人称视角时态不变；④到字数上限立即停笔。`,
  ];
  if (compressed) lines.push(`写作风格：${compressed}`);

  const result = lines.join('\n');
  staticPromptCache.set(key, result);
  return result;
}

/** 润色专用 systemInstruction（支持5种模式） */
function buildPolishSystemInstruction(style: WritingStyle, customPrompt: string, mode: PolishMode = 'standard'): string {
  const compressed = compressInstruction(customPrompt);
  const key = `sys:polish:${mode}:${style}:${compressed}`;
  const hit = staticPromptCache.get(key);
  if (hit) return hit;

  const { prompt } = STYLE_CONFIGS[style];

  const MODE_INSTRUCTIONS: Record<PolishMode, string[]> = {
    'standard': [
      `你是一位专业的中文文字编辑，请${prompt}对文字进行润色。`,
      `任务：修改病句、优化措辞、增强文学性，保留原意与情节。输出字数不超过原文110%。`,
      `输出规则：直接输出润色后的完整全文，不要解释，不要分析。`,
    ],
    'spot-fix': [
      `你是一位严谨的中文校对员。`,
      `任务：仅修正错别字、语法错误、标点使用不当，严禁改动文字风格、词汇选择和句式结构。`,
      `输出规则：直接输出修正后的全文，不要解释，保持原文风格99%不变。`,
    ],
    'rewrite': [
      `你是一位擅长改稿的中文小说作家，请${prompt}。`,
      `任务：在完整保留情节内容、人物动作和信息量的前提下，用全新的语句重新表达，改变句式结构和词汇选择，让行文耳目一新。`,
      `输出规则：直接输出重写后的全文，内容与原文等量，不要解释。`,
    ],
    'rework': [
      `你是一位资深中文小说结构编辑，请${prompt}。`,
      `任务：重新组织段落结构和叙事节奏，使逻辑更清晰、情节推进更流畅。可以调整段落划分、合并重复信息、拆分过长段落，但不得删减核心情节。`,
      `输出规则：直接输出重构后的全文，不要解释，不要说明修改之处。`,
    ],
    'anti-detect': [
      `你是一位专门"去AI化"的中文文字处理专家。`,
      `任务：将以下文字改写得更像真实人类写作。具体要求：①去除"渐渐""不禁""顿时""仿佛""似乎""霎时"等AI高频副词；②打破刻板的对仗句式和排比结构；③去除"随着X的Y，Z越来越W"等模板化句型；④避免"就在这时""突然间""不知为何"等廉价过渡；⑤让句子长短参差，加入口语化或留白表达；⑥保留全部情节内容和人物对话，不得删减。`,
      `输出规则：直接输出改写后的全文，不要解释，不要标注修改之处。`,
    ],
  };

  const lines = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS['standard'];
  if (compressed && mode !== 'anti-detect') lines.push(`写作风格：${compressed}`);

  const result = lines.join('\n');
  staticPromptCache.set(key, result);
  return result;
}

// dev: 打印最终 prompt（帮助调试）
function devLogPrompt(label: string, system: string, userMsg: string) {
  if (!import.meta.env.DEV) return;
  const total = system.length + userMsg.length;
  console.groupCollapsed(`[AI for Write] ${label} prompt (${total} chars, sys=${system.length}, user=${userMsg.length})`);
  console.log('── SYSTEM ──\n', system);
  console.log('── USER ──\n', userMsg);
  console.groupEnd();
}

// 字数目标表
const LENGTH_TARGETS: Record<string, number> = { short: 150, medium: 300, long: 500 };

/**
 * 构建 XML 结构化的用户续写消息。
 *
 * 结构：
 *   <续写>
 *     <约束>字数上限</约束>
 *     <背景>记忆/摘要/文风/本次指令</背景>
 *     <前文>前章尾/正文尾</前文>
 *   </续写>
 */
function buildContinueUserMessage(params: {
  text: string;
  writeLength: string;
  oneTimePrompt: string;
  memoryContext: string;
  compactSummary?: string;
  prevChapterTail?: string;
  styleBlock?: string;     // 模仿模式注入
  versionAngle?: string;
}): string {
  const {
    text, writeLength, oneTimePrompt, memoryContext,
    compactSummary, prevChapterTail, styleBlock, versionAngle,
  } = params;

  const wordTarget = LENGTH_TARGETS[writeLength] ?? 300;

  // ── <约束> ────────────────────────────────────────────────
  const constraintSection = `<约束>续写 ${wordTarget} 字以内</约束>`;

  // ── <背景> ────────────────────────────────────────────────
  const bgParts: string[] = [];

  // 记忆：max 600 tokens
  if (memoryContext.trim()) {
    bgParts.push(budgetTruncate(memoryContext.trim(), 600));
  }
  // 压缩摘要：max 300 tokens（避免与记忆重叠）
  if (compactSummary?.trim()) {
    bgParts.push(budgetTruncate(compactSummary.trim(), 300));
  }
  // 文风档案（模仿模式）：max 150 tokens
  if (styleBlock?.trim()) {
    bgParts.push(budgetTruncate(styleBlock.trim(), 150));
  }
  // 本次指令：max 80 tokens
  if (oneTimePrompt.trim()) {
    bgParts.push(`<本次指令>${budgetTruncate(oneTimePrompt.trim(), 80)}</本次指令>`);
  }
  // 版本角度：max 50 tokens
  if (versionAngle?.trim()) {
    bgParts.push(`<写作角度>${budgetTruncate(versionAngle.trim(), 50)}</写作角度>`);
  }

  const bgSection = bgParts.length > 0
    ? `<背景>\n${bgParts.join('\n')}\n</背景>`
    : '';

  // ── <前文> ────────────────────────────────────────────────
  const prevParts: string[] = [];
  // 前章尾：max 150 tokens
  if (prevChapterTail?.trim()) {
    const tail = budgetTruncate(prevChapterTail.trim(), 150);
    prevParts.push(`<前章尾（仅背景，勿重复）>${tail}</前章尾（仅背景，勿重复）>`);
  }
  // 当前正文末尾：~700 tokens（2200 chars）
  const contextTail = text.slice(-CONTEXT_TAIL_CHARS);
  prevParts.push(`<正文末尾>\n${contextTail}\n</正文末尾>`);

  const prevSection = `<前文>\n${prevParts.join('\n')}\n</前文>`;

  // ── 组装 ─────────────────────────────────────────────────
  const sections = [constraintSection, bgSection, prevSection].filter(Boolean);
  return `<续写>\n${sections.join('\n')}\n</续写>`;
}

function mergePrompt(staticBlock: string, dynamicBlock: string): string {
  return `${staticBlock}\n\n${dynamicBlock}`;
}

// ── 通用 SSE 解析 generator ─────────────────────────────────────

interface GeminiSSEChunk {
  text?: string;
  finishReason?: string;
}

/**
 * 解析 Gemini SSE 流式响应的通用 generator。
 * 三处流式调用（续写 / 接着写 / 润色）共用此函数，消除代码重复。
 */
async function* parseGeminiSSEStream(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<GeminiSSEChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) { reader.cancel().catch(() => {}); return; }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 报文以双换行 \n\n 或 \r\n\r\n 结尾
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        if (!part.trim()) continue;

        // 提取同一块中所有 data: 后的内容拼装成完整的 JSON
        let jsonStr = '';
        for (const line of part.split(/\r?\n/)) {
          if (line.startsWith('data:')) {
            jsonStr += line.replace(/^data:\s?/, '');
          } else if (line && !line.startsWith('event:') && !line.startsWith('id:') && !line.startsWith(':')) {
            jsonStr += line;
          }
        }

        jsonStr = jsonStr.trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = JSON.parse(jsonStr) as Record<string, any>;
          const candidate = data?.candidates?.[0];
          yield {
            text: candidate?.content?.parts?.[0]?.text as string | undefined,
            finishReason: candidate?.finishReason as string | undefined,
          };
        } catch (err) {
          console.error('[SSE Parse Error] Failed to parse JSON chunk:', err);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

function getTemperature(creativity: CreativityLevel | undefined): number {
  return CREATIVITY_CONFIGS[creativity ?? 'balanced'].temperature;
}

function buildPolishDynamicBlock(text: string, oneTimePrompt: string, memoryContext: string, mode: PolishMode = 'standard'): string {
  const charCount = text.replace(/\s/g, '').length;
  const taskLabels: Record<PolishMode, string> = {
    'standard':    `润色以下文字（修改病句、优化措辞、增强文学性），输出字数不超过原文 110%（原文 ${charCount} 字）。`,
    'spot-fix':    `校对以下文字（仅修错别字和语法），保留原文风格，输出字数与原文接近（原文 ${charCount} 字）。`,
    'rewrite':     `重写以下文字（保留情节，全新句式），输出字数与原文相当（原文 ${charCount} 字）。`,
    'rework':      `重构以下文字的段落结构与叙事节奏，输出字数与原文相当（原文 ${charCount} 字），不得删减核心情节。`,
    'anti-detect': `对以下文字进行去AI化处理，输出字数与原文相当（原文 ${charCount} 字），不得删减任何内容。`,
  };
  const parts: string[] = [taskLabels[mode] ?? taskLabels['standard']];
  if (memoryContext.trim() && mode !== 'spot-fix') parts.push(budgetTruncate(memoryContext.trim(), 400));
  if (oneTimePrompt.trim()) parts.push(`<本次要求>${budgetTruncate(oneTimePrompt.trim(), 80)}</本次要求>`);
  parts.push(`<原文>\n${text}\n</原文>`);
  return parts.join('\n');
}

export async function* streamContinue(
  text: string,
  settings: AppSettings,
  oneTimePrompt = '',
  memoryContext = '',
  prevChapterTail = '',
  signal?: AbortSignal,
  versionAngle?: string,
  styleBlock?: string,   // 模仿模式：格式化后的文风档案字符串
): AsyncGenerator<string> {
  const { apiKey, style, model } = settings;

  // ── 构建 systemInstruction（可被 Gemini 缓存） ───────────
  const systemText = buildSystemInstruction(style, settings.customPrompt ?? '');

  // ── 拆分 memoryContext 与 compactSummary ─────────────────
  // buildMemoryContextWithCompact 将 memory + compact 合并在一起，
  // 这里需要拆开分别限流。若无法分开则整体截断。
  const compactMatch = memoryContext.match(/<compact_summary>([\s\S]*?)<\/compact_summary>/);
  const compactSummary = compactMatch ? compactMatch[0] : '';
  const memoryOnly = compactMatch
    ? memoryContext.replace(compactMatch[0], '').trim()
    : memoryContext;

  // ── 构建结构化用户消息 ────────────────────────────────────
  const userMessage = buildContinueUserMessage({
    text,
    writeLength: settings.writeLength ?? 'medium',
    oneTimePrompt,
    memoryContext: memoryOnly,
    compactSummary,
    prevChapterTail,
    styleBlock,
    versionAngle,
  });

  devLogPrompt('续写', systemText, userMessage);

  const cacheKey = makeCacheKey({
    actionType: 'continue',
    content: text,
    oneTimePrompt,
    memoryContext,
    staticBlock: systemText,
    dynamicBlock: userMessage,
    settings,
  });

  const cacheHit = getCache(cacheKey);
  if (cacheHit?.text) {
    yield cacheHit.text;
    return;
  }

  const url = `${API_BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: withNoThinking(model, {
        temperature: (settings as AppSettings & { _tempOverride?: number })._tempOverride ?? getTemperature(settings.creativity),
        maxOutputTokens: LENGTH_CONFIGS[settings.writeLength ?? 'medium'].tokens,
      }),
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (!response.ok) {
    throw await toFriendlyError(response);
  }

  let fullText = '';
  let isMaxTokensStop = false;

  for await (const chunk of parseGeminiSSEStream(response, signal)) {
    if (chunk.text) {
      fullText += chunk.text;
      yield chunk.text;
    }
    if (chunk.finishReason === 'MAX_TOKENS') {
      isMaxTokensStop = true;
      yield TRUNCATION_SENTINEL;
    }
  }

  if (!isMaxTokensStop && fullText.trim()) {
    setCache(cacheKey, {
      createdAt: Date.now(),
      text: fullText,
      tokenEstimateIn: estimateTokens(mergePrompt(systemText, userMessage)),
      tokenEstimateOut: estimateTokens(fullText),
    });
  }
}

// ── 从截断处续写（MAX_TOKENS 后"接着写"）────────────────────────
export async function* streamResume(
  originalText: string,
  truncatedPart: string,
  settings: AppSettings,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const { apiKey, model } = settings;
  const tail = (originalText + truncatedPart).slice(-1800);
  const prompt = `你正在续写一篇小说，上一次输出因达到字数上限而中断。请从中断处继续，无缝衔接，不要重复已有内容，不要解释或说明，直接续写正文。

【已有内容结尾（请从此处衔接）】
${tail}`;

  const url = `${API_BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: withNoThinking(model, {
        temperature: getTemperature(settings.creativity),
        maxOutputTokens: LENGTH_CONFIGS[settings.writeLength ?? 'medium'].tokens,
      }),
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });
  if (!response.ok) throw await toFriendlyError(response);

  for await (const chunk of parseGeminiSSEStream(response, signal)) {
    if (chunk.text) yield chunk.text;
    if (chunk.finishReason === 'MAX_TOKENS') yield TRUNCATION_SENTINEL;
  }
}

// ── 用户偏好自动提取 ─────────────────────────────────────────
export async function extractWritingPreference(
  acceptedText: string,
  settings: AppSettings,
): Promise<string> {
  if (!settings.apiKey || acceptedText.trim().length < 80) return '';
  const prompt = `分析以下小说文段的写作风格特征，提炼出 2～3 条简洁的风格规律（每条不超过20字）。
只输出规律列表，格式：【规律1】xxx；【规律2】xxx；【规律3】xxx
不要解释，不要其他内容。

【文段】
${acceptedText.slice(0, 800)}`;
  try {
    return await callGemini(settings.apiKey, settings.model, prompt, { temperature: 0.3, maxOutputTokens: 200 });
  } catch { return ''; }
}

// ── 一致性检查 ────────────────────────────────────────────────

export interface ConsistencyIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export async function checkConsistency(
  chapterContent: string,
  truthFiles: Record<string, string>,
  settings: AppSettings,
): Promise<ConsistencyIssue[]> {
  const { apiKey, model } = settings;
  const tfLines = Object.entries(truthFiles)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `【${k}】\n${v.slice(0, 600)}`)
    .join('\n\n');

  const prompt = `你是一位专业的中文小说编辑，负责检查章节内容与已有设定文件的一致性。

【已有设定文件】
${tfLines || '（暂无设定文件）'}

【待检查章节内容】
${chapterContent.slice(0, 3000)}

请找出章节中与设定文件矛盾或不一致的地方。以 JSON 数组格式返回，每条格式：
{"severity":"high|medium|low","description":"问题描述","suggestion":"修改建议"}

如果没有问题，返回空数组 []。只返回 JSON，不要其他文字。`;

  const raw = await callGemini(apiKey, model, prompt, { temperature: 0.3, maxOutputTokens: 4096 });
  return parseJsonArray<ConsistencyIssue>(raw);
}

// ── 大纲生成 ──────────────────────────────────────────────────

export async function generateOutline(
  synopsis: string,
  existingChapterCount: number,
  settings: AppSettings,
): Promise<Array<{ title: string; synopsis: string }>> {
  const { apiKey, model } = settings;
  const prompt = `你是一位资深中文小说策划编辑。根据以下作品简介，为小说规划后续章节大纲。

【作品简介】
${synopsis}

【当前已有章节数】${existingChapterCount}

请规划接下来 5 个章节的大纲，以 JSON 数组格式返回：
[{"title":"章节名","synopsis":"本章梗概（50字以内）"}]

只返回 JSON，不要其他文字。`;

  const raw = await callGemini(apiKey, model, prompt, { temperature: 0.7, maxOutputTokens: 2048 });
  return parseJsonArray<{ title: string; synopsis: string }>(raw);
}

/** 单块润色（内部使用，流式 + 禁用 thinking） */
async function polishChunk(
  chunk: string,
  settings: AppSettings,
  oneTimePrompt: string,
  memoryContext: string,
  signal?: AbortSignal,
  mode: PolishMode = 'standard',
): Promise<string> {
  const { apiKey, style, model } = settings;
  const systemText = buildPolishSystemInstruction(style, settings.customPrompt ?? '', mode);
  const userMessage = buildPolishDynamicBlock(chunk, oneTimePrompt, memoryContext, mode);

  // 使用模型最大输出上限，并禁用 thinking 防止其消耗输出配额
  const maxOutputTokens = getModelMaxOutputTokens(model);

  const url = `${API_BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: withNoThinking(model, { temperature: 0.6, maxOutputTokens }),
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (!response.ok) throw await toFriendlyError(response);

  let result = '';
  let truncated = false;

  for await (const sseChunk of parseGeminiSSEStream(response, signal)) {
    if (sseChunk.text) result += sseChunk.text;
    if (sseChunk.finishReason === 'MAX_TOKENS') truncated = true;
  }

  if (truncated) {
    // thinking 被禁用后理论上不会走到这里；若仍截断说明块本身超长
    return result + '\n[…此块润色截断，请缩短段落后重试]';
  }
  return result;
}

/**
 * 将文本按段落边界拆分为不超过 maxChars 字符的块。
 * 返回每块的文本内容。
 */
function splitIntoPolishChunks(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n/).map(l => l.trimEnd());
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const para of paragraphs) {
    const paraLen = para.replace(/\s/g, '').length;
    if (currentLen + paraLen > maxChars && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [];
      currentLen = 0;
    }
    current.push(para);
    currentLen += paraLen;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
}

export async function polishText(
  text: string,
  settings: AppSettings,
  oneTimePrompt = '',
  memoryContext = '',
  signal?: AbortSignal,
  mode: PolishMode = 'standard',
): Promise<string> {
  const { apiKey, style } = settings;
  if (!apiKey) throw new Error('请先在设置中填入 Gemini API Key');
  const textLen = text.replace(/\s/g, '').length;

  // ── 短文：单块润色（走缓存） ─────────────────────────────
  if (textLen <= POLISH_CHUNK_CHARS) {
    const staticBlock = buildPolishSystemInstruction(style, settings.customPrompt ?? '', mode);
    const dynamicBlock = buildPolishDynamicBlock(text, oneTimePrompt, memoryContext, mode);
    const fullPrompt = mergePrompt(staticBlock, dynamicBlock);
    const cacheKey = makeCacheKey({ actionType: `polish:${mode}`, content: text, oneTimePrompt, memoryContext, staticBlock, dynamicBlock, settings });

    const cacheHit = getCache(cacheKey);
    if (cacheHit?.text) return cacheHit.text;

    const result = await polishChunk(text, settings, oneTimePrompt, memoryContext, signal, mode);
    if (result.trim() && !result.includes('[…润色截断')) {
      setCache(cacheKey, {
        createdAt: Date.now(),
        text: result,
        tokenEstimateIn: estimateTokens(fullPrompt),
        tokenEstimateOut: estimateTokens(result),
      });
    }
    return result;
  }

  // ── 长文：按段落分块，串行润色后拼接 ────────────────────
  const chunks = splitIntoPolishChunks(text, POLISH_CHUNK_CHARS);
  const results: string[] = [];

  // rework/anti-detect 需要知道前块结尾来保持风格连贯；其他模式只在首块传记忆
  const needsCarryover = mode === 'rework' || mode === 'anti-detect';

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
    const chunkOneTime = i === 0 ? oneTimePrompt : '';
    let chunkMemory = i === 0 ? memoryContext : '';
    if (needsCarryover && i > 0 && results[i - 1]) {
      // 取上一块输出末尾 200 字作为连接上下文，帮助模型保持风格一致
      const prevTail = results[i - 1].slice(-200);
      chunkMemory = `<前段结尾（保持风格衔接）>${prevTail}</前段结尾>`;
    }
    const polished = await polishChunk(chunks[i], settings, chunkOneTime, chunkMemory, signal, mode);
    results.push(polished);
  }

  return results.join('\n\n');
}

// ── 记忆宫殿：实体自动提取 ───────────────────────────────────

/**
 * 从新增文字中轻量提取角色/世界设定变化。
 * 用于 acceptContinuation 后异步触发，token 消耗极低。
 * 返回需要 upsert 的条目列表（type/name/content）。
 */
export interface ExtractedMemoryItem {
  type: 'character' | 'world_rule';
  name: string;
  content: string;
}

export async function extractEntitiesFromAccepted(
  newText: string,
  settings: AppSettings,
): Promise<ExtractedMemoryItem[]> {
  if (!settings.apiKey || newText.trim().length < 60) return [];

  const prompt = `从以下小说新增片段中，提取需要记录的信息（角色状态变化或新出现的世界设定）。
只提取有实质内容变化的条目，没有则返回空数组。

输出格式（JSON数组）：
[{"type":"character","name":"角色名","content":"简短描述当前状态/变化（50字内）"},
 {"type":"world_rule","name":"规则/设定名","content":"简短描述（50字内）"}]

如无值得记录的变化，返回：[]
只返回JSON，不要其他文字。

【新增片段】
${newText.slice(0, 600)}`;

  try {
    const raw = await callGemini(settings.apiKey, settings.model, prompt, {
      temperature: 0.2,
      maxOutputTokens: 400,
    });
    const arr = parseJsonArray<ExtractedMemoryItem>(raw);
    return arr.filter(
      item => (item.type === 'character' || item.type === 'world_rule')
        && typeof item.name === 'string' && item.name.trim()
        && typeof item.content === 'string' && item.content.trim(),
    );
  } catch { return []; }
}

/**
 * 章节完成时生成 ~150 字摘要，用于记忆宫殿的章节摘要层。
 * 失败时抛出错误（由 useChapterComplete 捕获并单独处理）。
 */
export async function generateChapterSummary(
  chapterTitle: string,
  content: string,
  settings: AppSettings,
): Promise<string> {
  if (!settings.apiKey) throw new Error('请先在设置中填写 API Key');
  if (content.trim().length < 100) throw new Error('章节内容过短（需至少 100 字）');

  const prompt = `为以下小说章节生成一段 100～150 字的情节摘要，客观记录关键事件、人物行动和情感变化，不要评价。
只输出摘要正文，不要加标题或前缀。

【章节标题】${chapterTitle}
【章节内容】
${content.slice(0, 5000)}`;

  // 2.5 Pro 强制开启 thinking，thinking token 消耗 maxOutputTokens，需留足空间；
  // 2.5 Flash 通过 withNoThinking 关闭 thinking，token 全给正文。
  const result = await callGemini(
    settings.apiKey,
    settings.model,
    prompt,
    withNoThinking(settings.model, { temperature: 0.3, maxOutputTokens: 2048 }),
  );
  return result.trim();
}

/**
 * 章节完成时从全章内容提取/更新角色档案和世界设定。
 * 返回提取到的条目列表（可能为空数组，但不会静默吞掉 API 错误）。
 */
export async function extractChapterEntities(
  chapterTitle: string,
  content: string,
  settings: AppSettings,
): Promise<ExtractedMemoryItem[]> {
  if (!settings.apiKey) throw new Error('请先在设置中填写 API Key');
  if (content.trim().length < 100) return []; // 内容过短直接返回空，不算错误

  const prompt = `从以下小说章节中提取需要长期记录的信息，返回 JSON 数组。

要求：
- 提取角色档案（type: "character"）：姓名、外貌、性格、当前状态、与其他角色的关系
- 提取世界设定（type: "world_rule"）：地点、规则、势力、重要物品、特殊设定
- 每条 content 不超过 80 字，只记录本章新出现或有变化的信息
- 共提取 5～10 条最重要的信息
- 如果章节中没有值得记录的新信息，返回空数组 []

严格按此格式输出，只返回 JSON，不要任何其他文字：
[{"type":"character","name":"角色名","content":"档案内容"},{"type":"world_rule","name":"设定名","content":"规则内容"}]

【章节标题】${chapterTitle}
【章节内容】
${content.slice(0, 6000)}`;

  const raw = await callGemini(
    settings.apiKey,
    settings.model,
    prompt,
    withNoThinking(settings.model, { temperature: 0.15, maxOutputTokens: 4096 }),
  );

  const arr = parseJsonArray<ExtractedMemoryItem>(raw);
  return arr.filter(
    item => (item.type === 'character' || item.type === 'world_rule')
      && typeof item.name === 'string' && item.name.trim()
      && typeof item.content === 'string' && item.content.trim(),
  );
}

// ── 大纲卡片梗概 AI 扩写 ──────────────────────────────────────

export async function expandOutlineSynopsis(
  title: string,
  currentSynopsis: string,
  settings: AppSettings,
): Promise<string> {
  const prompt = `你是一位小说策划编辑。请根据以下章节标题，写一段 50～80 字的章节梗概，概括本章可能发生的核心事件与情感转折。
只输出梗概正文，不要标题、不要解释。

章节标题：${title}
${currentSynopsis ? `当前梗概（可参考扩写）：${currentSynopsis}` : ''}`;

  const result = await callGemini(settings.apiKey, settings.model, prompt, {
    temperature: 0.7,
    maxOutputTokens: 250,
  });
  return result.trim();
}
