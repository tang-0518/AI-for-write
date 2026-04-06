// =============================================================
// api/gemini.ts — Google Gemini API 封装
//
// Prompt 工程设计：
//   systemInstruction — 角色定义 + 不变规则（Gemini 侧可缓存，~120 tokens）
//   user message      — XML 结构化动态内容，各区段有明确 token 预算
//
// Token 预算（续写，总 input ≈ 2200 tokens）：
//   systemInstruction : ~120
//   <约束>            :  ~40
//   <背景/记忆>       : max 600
//   <背景/摘要>       : max 300
//   <背景/文风>       : max 150  (模仿模式)
//   <背景/指令>       : max  80
//   <前文/前章>       : max 150  (可选)
//   <前文/正文>       : ~700     (末尾 2200 chars)
//   XML 结构标签      :  ~60
// =============================================================

import type { AppSettings, WritingStyle, CreativityLevel } from '../types';
import { STYLE_CONFIGS, LENGTH_CONFIGS, CREATIVITY_CONFIGS } from '../types';
import { estimateTokens, getCache, makeCacheKey, setCache } from './cache';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CONTEXT_TAIL_CHARS = 2200;
// 单次润色文字字符数上限；超过此值按段落分块
const POLISH_CHUNK_CHARS = 2000;

/** 根据模型名返回安全的最大输出 token 数 */
function getModelMaxOutputTokens(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('2.5')) return 32768;   // Gemini 2.5 系列支持大输出
  if (m.includes('2.0')) return 8192;
  return 8192;                           // 1.5 及其他保守上限
}

const staticPromptCache = new Map<string, string>();

// 将 HTTP 错误响应转为用户友好的中文消息
async function toFriendlyError(response: Response): Promise<Error> {
  try { await response.text(); } catch { /* ignore */ }
  const s = response.status;
  if (s === 400) return new Error('请求格式有误，请检查模型名称是否正确');
  if (s === 401 || s === 403) return new Error('API Key 无效或无权限，请在设置中重新填写');
  if (s === 404) return new Error('模型不存在或名称有误，请在设置中更正模型名称');
  if (s === 429) return new Error('请求太频繁，请稍候再试（超出 API 速率限制）');
  if (s === 502 || s === 503) return new Error('Gemini 服务暂时不可用，请稍后重试');
  if (s >= 500) return new Error('Gemini 服务器内部错误，请稍后重试');
  return new Error(`请求失败（HTTP ${s}），请检查网络或 API Key`);
}

// 公共 JSON 请求辅助，避免重复 fetch 样板
interface GeminiRequestConfig {
  temperature: number;
  maxOutputTokens: number;
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
    const match = raw.match(/\[[\s\S]*\]/);
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

/** 润色专用 systemInstruction */
function buildPolishSystemInstruction(style: WritingStyle, customPrompt: string): string {
  const compressed = compressInstruction(customPrompt);
  const key = `sys:polish:${style}:${compressed}`;
  const hit = staticPromptCache.get(key);
  if (hit) return hit;

  const { prompt } = STYLE_CONFIGS[style];
  const lines = [
    `你是一位专业的中文文字编辑，请${prompt}对文字进行润色。`,
    `输出规则：直接输出润色后的完整全文，不要解释，不要分析。`,
  ];
  if (compressed) lines.push(`写作风格：${compressed}`);

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

function getTemperature(creativity: CreativityLevel | undefined): number {
  return CREATIVITY_CONFIGS[creativity ?? 'balanced'].temperature;
}

function buildPolishDynamicBlock(text: string, oneTimePrompt: string, memoryContext: string): string {
  const charCount = text.replace(/\s/g, '').length;
  const parts: string[] = [
    `润色以下文字（修改病句、优化措辞、增强文学性），输出字数不超过原文 110%（原文 ${charCount} 字）。`,
  ];
  if (memoryContext.trim()) parts.push(budgetTruncate(memoryContext.trim(), 400));
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
      generationConfig: {
        temperature: (settings as AppSettings & { _tempOverride?: number })._tempOverride ?? getTemperature(settings.creativity),
        maxOutputTokens: LENGTH_CONFIGS[settings.writeLength ?? 'medium'].tokens,
      },
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

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let isMaxTokensStop = false;

  while (true) {
    if (signal?.aborted) { reader.cancel().catch(() => {}); return; }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    // SSE 报文以双换行 \n\n 或 \r\n\r\n 结尾
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? ''; // 最后一个不完整的块留在 buffer 中

    for (const part of parts) {
      if (part.trim() === '') continue;
      
      // 提取同一块中所有 data: 后的内容拼装成完整的 JSON
      let jsonStr = '';
      const lines = part.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('data:')) {
          jsonStr += line.replace(/^data:\s?/, '');
        } else {
          // Gemini部分响应多行JSON时后续行可能没有 data: 前缀
          jsonStr += line;
        }
      }
      
      jsonStr = jsonStr.trim();
      if (!jsonStr) continue;
      if (jsonStr === '[DONE]') return;
      
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = JSON.parse(jsonStr) as Record<string, any>;
        const candidate = data?.candidates?.[0];
        const chunk = candidate?.content?.parts?.[0]?.text as string | undefined;
        if (chunk) {
          fullText += chunk;
          yield chunk;
        }
        if (candidate?.finishReason === 'MAX_TOKENS') {
          isMaxTokensStop = true;
          yield '\n\n> ⚠️ 内容因达到 Token 上限而截断，可切换「长」模式或缩短原文后重试。';
        }
      } catch (err) {
        console.error('[SSE Parse Error] Failed to parse JSON chunk:', err);
      }
    }
  }

  if (!isMaxTokensStop && fullText.trim()) {
    setCache(cacheKey, {
      createdAt: Date.now(),
      text: fullText,
      tokenEstimateIn: estimateTokens(fullPrompt),
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
      generationConfig: {
        temperature: getTemperature(settings.creativity),
        maxOutputTokens: LENGTH_CONFIGS[settings.writeLength ?? 'medium'].tokens,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });
  if (!response.ok) throw await toFriendlyError(response);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) { reader.cancel().catch(() => {}); return; }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.trim()) continue;
      let jsonStr = '';
      for (const line of part.split(/\r?\n/)) {
        jsonStr += line.startsWith('data:') ? line.replace(/^data:\s?/, '') : line;
      }
      jsonStr = jsonStr.trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = JSON.parse(jsonStr) as Record<string, any>;
        const chunk = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
        if (chunk) yield chunk;
      } catch { /* skip */ }
    }
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

/** 单块润色（内部使用） */
async function polishChunk(
  chunk: string,
  settings: AppSettings,
  oneTimePrompt: string,
  memoryContext: string,
  signal?: AbortSignal,
): Promise<string> {
  const { apiKey, style, model } = settings;
  const systemText = buildPolishSystemInstruction(style, settings.customPrompt ?? '');
  const userMessage = buildPolishDynamicBlock(chunk, oneTimePrompt, memoryContext);
  // fallback fullPrompt (used only for cache key estimation)
  const fullPrompt = mergePrompt(systemText, userMessage);

  const chunkLen = chunk.replace(/\s/g, '').length;
  const modelMax = getModelMaxOutputTokens(model);
  const maxOutputTokens = Math.min(Math.ceil(chunkLen * 2.2), modelMax);

  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (!response.ok) throw await toFriendlyError(response);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as Record<string, any>;
  const candidate = data?.candidates?.[0];
  const result = (candidate?.content?.parts?.[0]?.text as string) ?? '';

  if (candidate?.finishReason === 'MAX_TOKENS') {
    // 块级截断：返回已有结果并附加提示，不中断整体流程
    return result + '\n[…润色截断，后续内容保持原文]';
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
): Promise<string> {
  const { apiKey, style, model } = settings;
  const textLen = text.replace(/\s/g, '').length;

  // ── 短文：单块润色（走缓存） ─────────────────────────────
  if (textLen <= POLISH_CHUNK_CHARS) {
    const staticBlock = buildPolishStaticBlock(style, settings.customPrompt ?? '');
    const dynamicBlock = buildPolishDynamicBlock(text, oneTimePrompt, memoryContext);
    const fullPrompt = mergePrompt(staticBlock, dynamicBlock);
    const cacheKey = makeCacheKey({ actionType: 'polish', content: text, oneTimePrompt, memoryContext, staticBlock, dynamicBlock, settings });

    const cacheHit = getCache(cacheKey);
    if (cacheHit?.text) return cacheHit.text;

    const result = await polishChunk(text, settings, oneTimePrompt, memoryContext, signal);
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
  if (!apiKey) throw new Error('请先在设置中填入 Gemini API Key');
  const chunks = splitIntoPolishChunks(text, POLISH_CHUNK_CHARS);
  const results: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
    // 仅第一块传入 memoryContext 和 oneTimePrompt，后续块简化避免重复指令
    const chunkMemory = i === 0 ? memoryContext : '';
    const chunkOneTime = i === 0 ? oneTimePrompt : '';
    const polished = await polishChunk(chunks[i], settings, chunkOneTime, chunkMemory, signal);
    results.push(polished);
  }

  return results.join('\n');
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
