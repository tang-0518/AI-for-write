import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";

export async function buildStoryArc(
  title:     string,
  wordCount: number = 300000
): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  if (!bible.worldview || !bible.characters || !bible.timeline) {
    throw new Error("请先完成世界观、人物设定和时间线");
  }

  const earlyCount = Math.round(wordCount * 0.33);

  const result = await callClaude({
    system: `你是一位网络小说故事结构设计师，深谙中国网文的节奏控制、爽点设计与读者心理。
前期故事走向要做到：每5章一个小高潮，每20章一个大转折，每万字有一个让读者截图转发的爽点。
输出格式：Markdown，使用中文。`,
    user: `${context}

---
请为小说《${title}》设计前期故事走向（前${earlyCount}字，约前${Math.round(earlyCount/2000)}章）：

1. 整体结构分幕（建议3-4幕）
   - 每幕的核心任务、字数范围、主基调

2. 各幕关键剧情节点（每幕3-5个）
   - 具体的场景/事件
   - 推动力（为什么发生）
   - 后果（改变了什么）

3. 前期爽点清单（每万字一个）
   - 爽点类型（信息差/逆转/成长/反制）
   - 具体呈现方式

4. 情感温度曲线
   - 何时轻松，何时紧张，何时热血，何时温情

5. 前期收尾设计（如何结束前期、开启中期悬念）`,
    maxTokens: 8192,
  });

  await writeBible(title, {
    storyArc: { content: result, generatedAt: new Date().toISOString() },
  });

  return result;
}
