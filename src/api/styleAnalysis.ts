// =============================================================
// api/styleAnalysis.ts — 文风学习 AI 分析
// =============================================================

import type { AppSettings }   from '../types';
import type { StyleProfile }   from '../types/styleProfile';
import { parseJsonObject } from './gemini';

const API_BASE_STYLE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 调用 Gemini 并强制要求 JSON 输出（responseMimeType）。
 * 比 callGemini 更健壮：启用 JSON 模式 + 增大 token 上限。
 */
async function callGeminiJson(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const url = `${API_BASE_STYLE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!response.ok) {
    const msg = response.status === 429 ? '请求频率超限，请稍后重试'
      : response.status === 403 ? 'API Key 无效或无权限'
      : `HTTP ${response.status}`;
    throw new Error(msg);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as Record<string, any>;
  // Gemini 2.5 Pro（思考模型）会在 parts 中混入 thought:true 的思考片段，
  // 实际 JSON 输出在最后一个非思考 part 中。过滤后取最后一段文本。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.filter((p: any) => !p.thought && typeof p.text === 'string').pop();
  return (textPart?.text as string) ?? '';
}

/**
 * 比 parseJsonObject 更健壮的 JSON 提取：
 * 1. 先尝试直接 parse（JSON 模式下模型通常直接返回合法 JSON）
 * 2. 再尝试从 ```json...``` 代码块中提取
 * 3. 最后使用正则找到最外层 {...}
 */
function safeParseJson(raw: string): Record<string, string> {
  const s = raw.trim();
  // 1. 直接解析
  try { return JSON.parse(s) as Record<string, string>; } catch { /* 继续 */ }
  // 2. 代码块
  const codeMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]) as Record<string, string>; } catch { /* 继续 */ }
  }
  // 3. 正则提取最外层 {...}（贪婪）
  return parseJsonObject(raw);
}

const MAX_CHARS_PER_CHAPTER = 2000; // 每章最多采样字数（节省 token）
const MAX_EXEMPLAR_CHARS    = 280;  // few-shot 示例段落最大字数

/**
 * 从章节列表中提取最具代表性的 2 个段落作为 exemplar。
 * 选取标准：字数 80-280，非纯对话，非纯白描。
 */
function extractExemplars(text: string): string[] {
  const paragraphs = text
    .split(/\n{1,}/)
    .map(p => p.trim())
    .filter(p => {
      const len = p.replace(/\s/g, '').length;
      return len >= 60 && len <= MAX_EXEMPLAR_CHARS;
    });

  if (paragraphs.length === 0) return [];

  // 偏向选取包含描写（非纯对话"xxx"）且有动词的段落
  const scored = paragraphs.map(p => {
    let score = 0;
    if (!/^[「『""]/.test(p)) score += 2;          // 非引号开头（不是纯对话）
    if (/[着了过]/.test(p)) score += 1;             // 有动态动词
    if (/[，。；]/.test(p) && p.length > 80) score += 1; // 有标点且够长
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 取最高分的 2 段，并保证它们不重叠（来自不同位置）
  const picked: string[] = [];
  for (const { p } of scored) {
    if (picked.length >= 2) break;
    if (!picked.some(prev => prev.includes(p.slice(0, 20)))) {
      picked.push(p.slice(0, MAX_EXEMPLAR_CHARS));
    }
  }
  return picked;
}

/**
 * 对多章内容进行文风分析，返回结构化 StyleProfile（除 id/name/source 字段）。
 * 调用方负责填写 id、name、sourceBookId、sourceChapterIds。
 */
export async function analyzeWritingStyle(
  chapters: { title: string; content: string }[],
  settings: AppSettings,
): Promise<Omit<StyleProfile, 'id' | 'name' | 'sourceBookId' | 'sourceChapterIds' | 'analyzedAt'>> {
  const { apiKey, model } = settings;

  // 拼接采样内容（每章最多 CHARS 字，总量控制在 ~8000 字以内）
  const sampledText = chapters
    .map(c => {
      const body = c.content.replace(/\s+/g, ' ').trim();
      return `【${c.title}】\n${body.slice(0, MAX_CHARS_PER_CHAPTER)}`;
    })
    .join('\n\n')
    .slice(0, 5000);

  const prompt = `你是专业的文学风格分析师。请分析下方文段的写作风格，直接输出 JSON，不要包含任何解释或 markdown。

JSON 格式如下（所有字段均为字符串，不可省略）：
{
  "sentenceStyle": "句式特点，≤25字",
  "dialogueStyle": "对话特点，≤25字",
  "descriptionStyle": "描写风格，≤25字",
  "narrativePOV": "叙事视角，≤20字",
  "pacingStyle": "节奏特点，≤25字",
  "vocabularyStyle": "词汇层次，≤20字",
  "emotionStyle": "情感表达方式，≤25字",
  "uniquePatterns": "独特规律，≤30字",
  "directive": "仿写指令1；仿写指令2；仿写指令3（3-4条，分号分隔，每条≤20字）"
}

【待分析文段】
${sampledText}

请直接输出 JSON，不要有任何前缀文字。`;

  const raw = await callGeminiJson(apiKey, model, prompt);
  const obj = safeParseJson(raw);

  // 若某字段为空（解析失败），抛出可见错误，而非悄悄回退为默认文本
  const missing = ['sentenceStyle','dialogueStyle','descriptionStyle','narrativePOV',
    'pacingStyle','vocabularyStyle','emotionStyle','uniquePatterns','directive']
    .filter(k => !obj[k]?.trim());
  if (missing.length >= 5) {
    // 超过一半字段缺失说明解析彻底失败，抛出错误让用户重试
    throw new Error(`文风分析失败：模型返回格式异常，请重新尝试。（原始回包：${raw.slice(0, 120)}）`);
  }

  const analysis = {
    sentenceStyle:    obj.sentenceStyle?.trim()    || '句式多样，长短不一',
    dialogueStyle:    obj.dialogueStyle?.trim()    || '对话自然，贴合人物',
    descriptionStyle: obj.descriptionStyle?.trim() || '描写细腻，动静结合',
    narrativePOV:     obj.narrativePOV?.trim()     || '第三人称限知视角',
    pacingStyle:      obj.pacingStyle?.trim()      || '节奏张弛有度',
    vocabularyStyle:  obj.vocabularyStyle?.trim()  || '现代白话为主',
    emotionStyle:     obj.emotionStyle?.trim()     || '情感内敛含蓄',
    uniquePatterns:   obj.uniquePatterns?.trim()   || '暂未发现明显规律',
  };

  const directive = obj.directive?.trim() ?? '';
  const exemplars = extractExemplars(chapters.map(c => c.content).join('\n\n'));

  return { analysis, directive, exemplars };
}

/**
 * 将文风档案格式化为 prompt 注入字符串（控制 token 预算）。
 * 模式：
 *   'directive' — 只注入指令（~100 tokens）
 *   'full'      — 指令 + 1 个 exemplar（~250 tokens）
 */
export function formatStyleForPrompt(
  profile: StyleProfile,
  mode: 'directive' | 'full' = 'full',
): string {
  const parts: string[] = [];

  if (profile.directive.trim()) {
    parts.push(`<文风仿照>\n${profile.directive}\n</文风仿照>`);
  }

  if (mode === 'full' && profile.exemplars.length > 0) {
    parts.push(`<参照范文>\n${profile.exemplars[0]}\n</参照范文>`);
  }

  return parts.join('\n');
}
