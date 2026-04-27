import { callGemini, withNoThinking } from '../api/gemini';
import type { AppSettings } from '../types';
import type { TensionDimensions } from './types';
import { calcComposite } from './types';

const TENSION_SYSTEM = `你是专业的网文叙事张力分析师。分析章节正文的多维张力，输出纯 JSON。

## 评分维度（0–100 整数）

### 情节张力 (plot_tension)
衡量冲突强度、悬念密度和信息不对称程度：
- 20–40：日常推进，无显著冲突或悬念
- 40–60：存在小冲突或轻度悬念，情节有方向感
- 60–80：核心冲突爆发、重大悬念揭示或信息反转
- 80–100：生死对决、关键真相揭露、多线冲突交织
要素：主角是否面临阻碍？是否存在读者知但角色不知的信息？

### 情绪张力 (emotional_tension)
衡量角色情绪波动幅度和读者共情深度：
- 20–40：情绪平稳，角色心态无明显变化
- 40–60：角色有明显情绪反应（喜悦/忧虑/愤怒等）
- 60–80：角色经历强烈情绪冲击（悲痛/绝望/狂喜/恐惧）
- 80–100：情绪极限场景（生离死别/信仰崩塌/极致感动）
要素：是否有两难抉择？是否有牺牲或背叛？

### 节奏张力 (pacing_tension)
衡量场景切换频率、叙述节奏和信息密度：
- 20–40：舒缓铺陈，大段描写或内心独白为主
- 40–60：节奏适中，描写与行动交替
- 60–80：快节奏推进，频繁场景切换、密集对话或连续行动
- 80–100：极高密度信息轰炸、快速剪辑式场景切换

只输出一个 JSON 对象，不要其他文字：
{"plot_tension":55,"emotional_tension":40,"pacing_tension":60,
 "plot_justification":"一句话","emotional_justification":"一句话","pacing_justification":"一句话"}`;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export async function scoreChapterTension(
  content: string,
  chapterNumber: number,
  settings: AppSettings,
  prevComposite = 50,
): Promise<TensionDimensions | null> {
  if (!settings.apiKey || content.trim().length < 200) return null;

  const systemWithPrev = `${TENSION_SYSTEM}\n\n前章综合张力约为 ${prevComposite}/100，请结合判断本章是上升、持平还是回落。`;
  const userMsg = `第 ${chapterNumber} 章正文如下（前 8000 字）：\n\n${content.slice(0, 8000)}`;

  let raw: string;
  try {
    raw = await callGemini(
      settings.apiKey,
      settings.model,
      `${systemWithPrev}\n\n${userMsg}`,
      withNoThinking(settings.model, { temperature: 0.3, maxOutputTokens: 512 }),
    );
  } catch {
    return null;
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { data = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; } catch { /* ignore */ }
    }
  }

  if (!data) return null;

  const plot      = clamp(Number(data['plot_tension'])      || 50, 0, 100);
  const emotional = clamp(Number(data['emotional_tension']) || 50, 0, 100);
  const pacing    = clamp(Number(data['pacing_tension'])    || 50, 0, 100);

  return {
    plotTension:            plot,
    emotionalTension:       emotional,
    pacingTension:          pacing,
    composite:              calcComposite(plot, emotional, pacing),
    plotJustification:      String(data['plot_justification']      || ''),
    emotionalJustification: String(data['emotional_justification'] || ''),
    pacingJustification:    String(data['pacing_justification']    || ''),
    chapterNumber,
    scoredAt: Date.now(),
  };
}
