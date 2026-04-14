import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";

export async function generateOutline(
  title:     string,
  wordCount: number = 100000
): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  const chapterCount = Math.round(wordCount / 2000);

  if (!bible.worldview || !bible.characters || !bible.storyArc) {
    throw new Error("请先完成世界观、人物设定和故事走向");
  }

  const result = await callClaude({
    system: `你是一位专业的网络小说细纲写手，擅长把宏观故事走向分解为精确的章节级细纲。
细纲要求：每章有明确的场景、核心事件、人物情绪、推进目标和结尾钩子，信息密度高，不流于表面。
输出格式：Markdown，使用中文。每章独立成块。`,
    user: `${context}

---
请为小说《${title}》生成前${wordCount}字的详细细纲（约${chapterCount}章，每章2000字）：

每章细纲包含：
- 章名（有吸引力的标题）
- 场景：时间+地点+天气/氛围
- 主视角
- 核心事件（这章发生了什么，2-3句话）
- 关键对话或动作（最重要的一场戏）
- 人物情绪变化
- 推进目标（这章完成后，故事前进了哪一步）
- 结尾钩子（最后一句话的方向）
- 伏线（埋下或回收哪条线）

另外，每5章后附加一个"阶段小结"，说明这5章累计完成了什么。`,
    maxTokens: 8192,
  });

  await writeBible(title, {
    outline: { content: result, generatedAt: new Date().toISOString() },
  });

  return result;
}
