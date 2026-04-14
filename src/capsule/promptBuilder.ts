// =============================================================
// capsule/promptBuilder.ts — 胶囊 → prompt 压缩器
//
// 把 CharacterCapsule 的各字段压缩成可注入 prompt 的短文本。
// 目标：每个角色胶囊约 100-200 token，多个角色同时注入不超过 600 token。
// =============================================================

import type { CharacterCapsule } from './types';

// 中文 1字 ≈ 1.5 token（Gemini 分词器近似值）
export function estimateCapsuleTokens(text: string): number {
  return Math.ceil(text.trim().length * 1.5);
}

// ── 核心：构建 promptSnippet ──────────────────────────────────
// 格式：XML 标签包裹，Gemini 对结构化提示理解更好
export function buildPromptSnippet(cap: CharacterCapsule): string {
  const lines: string[] = [];

  if (cap.identity)    lines.push(`身份：${cap.identity}`);
  if (cap.personality) lines.push(`性格：${truncate(cap.personality, 60)}`);
  if (cap.voice)       lines.push(`声音：${truncate(cap.voice, 50)}`);

  const state = cap.currentState;
  if (state.goal)       lines.push(`当前目标：${state.goal}`);
  if (state.mood)       lines.push(`情绪：${state.mood}`);
  if (state.powerLevel) lines.push(`状态：${state.powerLevel}`);
  if (state.secrets.length > 0) {
    lines.push(`隐瞒：${state.secrets.slice(0, 2).join('；')}`);
  }

  return `<角色：${cap.name}>\n${lines.join('\n')}\n</角色：${cap.name}>`;
}

// ── 场景级上下文构建（多个胶囊组合）─────────────────────────
// 根据 token 预算，选取最相关的胶囊并拼合
export function buildCapsulesContext(
  capsules: CharacterCapsule[],
  tokenBudget = 600,
): string {
  if (!capsules.length) return '';

  const parts: string[] = [];
  let used = 0;

  for (const cap of capsules) {
    const snippet = cap.promptSnippet || buildPromptSnippet(cap);
    const cost    = estimateCapsuleTokens(snippet);
    if (used + cost > tokenBudget) break;
    parts.push(snippet);
    used += cost;
  }

  return parts.join('\n\n');
}

// ── 场景角色检测（从近期文本中识别出现的角色）──────────────
export function detectSceneCharacters(
  recentText: string,
  capsules: CharacterCapsule[],
  lookbackChars = 800,
): CharacterCapsule[] {
  const window = recentText.slice(-lookbackChars);
  return capsules.filter(c => window.includes(c.name));
}

// ── 工具 ──────────────────────────────────────────────────────
function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '…';
}

// ── 胶囊"详情"文本（用于胶囊 UI 预览，不注入 prompt）────────
export function buildCapsuleDetailText(cap: CharacterCapsule): string {
  const parts: string[] = [`【${cap.name}】`];
  if (cap.identity)    parts.push(`身份：${cap.identity}`);
  if (cap.appearance)  parts.push(`外貌：${cap.appearance}`);
  if (cap.backstory)   parts.push(`背景：${cap.backstory}`);
  if (cap.personality) parts.push(`性格：${cap.personality}`);
  if (cap.voice)       parts.push(`声音：${cap.voice}`);

  const s = cap.currentState;
  const stateLines = [
    s.goal       && `目标：${s.goal}`,
    s.mood       && `情绪：${s.mood}`,
    s.powerLevel && `状态：${s.powerLevel}`,
    s.knownFacts.length && `已知：${s.knownFacts.join('；')}`,
    s.secrets.length    && `隐瞒：${s.secrets.join('；')}`,
  ].filter(Boolean) as string[];

  if (stateLines.length) parts.push('\n── 当前状态 ──', ...stateLines);

  return parts.join('\n');
}
