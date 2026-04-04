// =============================================================
// api/gemini.ts — Google Gemini API 封装
// =============================================================

import type { AppSettings, WritingStyle } from '../types';
import { STYLE_CONFIGS, LENGTH_CONFIGS } from '../types';
import { estimateTokens, getCache, makeCacheKey, setCache } from './cache';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CONTEXT_TAIL_CHARS = 2200;

const staticPromptCache = new Map<string, string>();

// 将 HTTP 错误响应转为用户友好的中文消息
async function toFriendlyError(response: Response): Promise<Error> {
  try { await response.text(); } catch { /* ignore */ }
  const status = response.status;
  if (status === 400) return new Error('请求格式有误，请检查模型名称是否正确');
  if (status === 401 || status === 403) return new Error('API Key 无效或无权限，请在设置中重新填写');
  if (status === 404) return new Error('模型不存在或名称有误，请在设置中更正模型名称');
  if (status === 429) return new Error('请求太频繁，请稍候再试（超出 API 速率限制）');
  if (status >= 500) return new Error('Gemini 服务暂时不可用，请稍后重试');
  return new Error('请求失败（HTTP ' + status + '），请检查网络或 API Key');
}

function buildContinueStaticBlock(style: WritingStyle, customPrompt: string): string {
  const key = `continue:${style}:${customPrompt.trim()}`;
  const hit = staticPromptCache.get(key);
  if (hit) return hit;

  const { prompt } = STYLE_CONFIGS[style];
  let block = `你是一位卓越且不知疲倦的中文小说作家。请${prompt}。`;
  if (customPrompt.trim()) block += `\n【长期写作风格要求】：${customPrompt.trim()}`;

  staticPromptCache.set(key, block);
  return block;
}

function buildContinueDynamicBlock(text: string, writeLength: string, oneTimePrompt: string, memoryContext: string, prevChapterTail = ''): string {
  const context = text.slice(-CONTEXT_TAIL_CHARS);
  const lengthParams = writeLength === 'short'
    ? '【字数与结构约束：要求整体不少于150字。请详细展开1到2个细节。】'
    : writeLength === 'long'
    ? '【字数与结构强制约束：总字数必须突破 500中文字符！你具有严重”字数截断惰性”，本次必须克服！\n请严格按以下三段式结构展开：\n1. 深度扩写周围环境与气氛的细微变化（约150字）；\n2. 细腻刻画主角当前的复杂心理与回忆起伏（约150字）；\n3. 描写出人意料的动作变故或悬念陡生的对话（约200字）。】'
    : '【字数与结构约束：要求整体字数达到 300中文字符 左右。请至少分两段，把心理活动与动作细节写透。】';
  let extraRules = '';
  if (prevChapterTail.trim()) extraRules += `\n【前章结尾参考（仅作背景，不要重复）】\n${prevChapterTail.trim()}`;
  if (memoryContext.trim())   extraRules += `\n${memoryContext}`;
  if (oneTimePrompt.trim())   extraRules += `\n【本次特别要求】：${oneTimePrompt.trim()}`;
  return `根据以下内容进行高质量、细节极度丰富的续写。\n${lengthParams}${extraRules}\n` +
    `注意：直接续写正文，绝对不要重复原文，绝不要输出分析、大纲或任何解释性废话。必须保持与原文完全一致的人称、视角且叙事节奏饱满。\n\n` +
    `【原文结尾】\n${context}`;
}

function mergePrompt(staticBlock: string, dynamicBlock: string): string {
  return `${staticBlock}\n${dynamicBlock}`;
}

function buildPolishStaticBlock(style: WritingStyle, customPrompt: string): string {
  const key = `polish:${style}:${customPrompt.trim()}`;
  const hit = staticPromptCache.get(key);
  if (hit) return hit;

  const { prompt } = STYLE_CONFIGS[style];
  let block = `你是一位专业的中文文字编辑。请${prompt}。`;
  if (customPrompt.trim()) block += `\n【长期写作风格要求】：${customPrompt.trim()}`;

  staticPromptCache.set(key, block);
  return block;
}

function buildPolishDynamicBlock(text: string, oneTimePrompt: string, memoryContext: string): string {
  let extraRules = '';
  if (memoryContext.trim()) extraRules += `\n${memoryContext}`;
  if (oneTimePrompt.trim())  extraRules += `\n【本次特别要求】：${oneTimePrompt.trim()}`;
  return `对以下文字进行润色：` +
    `修改病句、优化措辞、增强文学性，保持原意和篇幅大致不变。${extraRules}\n` +
    `直接输出修改后的完整全文，不要任何解释。\n\n${text}`;
}

export async function* streamContinue(
  text: string,
  settings: AppSettings,
  oneTimePrompt = '',
  memoryContext = '',
  prevChapterTail = '',
): AsyncGenerator<string> {
  const { apiKey, style, model } = settings;
  const staticBlock = buildContinueStaticBlock(style, settings.customPrompt ?? '');
  const dynamicBlock = buildContinueDynamicBlock(text, settings.writeLength ?? 'medium', oneTimePrompt, memoryContext, prevChapterTail);
  const fullPrompt = mergePrompt(staticBlock, dynamicBlock);
  const cacheKey = makeCacheKey({
    actionType: 'continue',
    content: text,
    oneTimePrompt,
    memoryContext,
    staticBlock,
    dynamicBlock,
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
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: LENGTH_CONFIGS[settings.writeLength ?? 'medium'].tokens },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
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

export async function polishText(
  text: string,
  settings: AppSettings,
  oneTimePrompt = '',
  memoryContext = '',
): Promise<string> {
  const { apiKey, style, model } = settings;
  const staticBlock = buildPolishStaticBlock(style, settings.customPrompt ?? '');
  const dynamicBlock = buildPolishDynamicBlock(text, oneTimePrompt, memoryContext);
  const fullPrompt = mergePrompt(staticBlock, dynamicBlock);
  const cacheKey = makeCacheKey({
    actionType: 'polish',
    content: text,
    oneTimePrompt,
    memoryContext,
    staticBlock,
    dynamicBlock,
    settings,
  });

  const cacheHit = getCache(cacheKey);
  if (cacheHit?.text) return cacheHit.text;

  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 65536 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    }),
  });

  if (!response.ok) {
    throw await toFriendlyError(response);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as Record<string, any>;
  const candidate = data?.candidates?.[0];
  const result = (candidate?.content?.parts?.[0]?.text as string) ?? '';
  if (candidate?.finishReason === 'MAX_TOKENS') {
    return result + '\n\n> ⚠️ 润色内容因达到 Token 上限而截断，请缩短选中文字后重试。';
  }

  if (result.trim()) {
    setCache(cacheKey, {
      createdAt: Date.now(),
      text: result,
      tokenEstimateIn: estimateTokens(fullPrompt),
      tokenEstimateOut: estimateTokens(result),
    });
  }

  return result;
}
