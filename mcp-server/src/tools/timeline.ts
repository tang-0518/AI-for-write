import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";
import { extractAndSaveGraph }               from "./extractor.js";

export async function designTimeline(title: string): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  if (!bible.worldview || !bible.characters) {
    throw new Error("请先完成世界观构建和人物设定");
  }

  const result = await callClaude({
    system: `你是一位专业的叙事结构设计师，擅长设计多线并行、交汇合理的故事时间线。
时间线设计需要：大事件锚点清晰、各角色个人线有独立逻辑、多线交汇节点产生化学反应。
输出格式：Markdown，使用中文。`,
    user: `${context}

---
请为小说《${title}》设计完整的时间线体系：

1. 大事件年表（宏观时间线）
   - 故事开始前的背景事件
   - 全书主要事件节点（按时间顺序）

2. 主要角色个人时间线（每位主要角色）
   - 故事开始前的经历
   - 与主线交汇的关键时刻

3. 世界事件时间线（背景版）
   - 影响全局的大事件
   - 与主角命运的交织点

4. 多线交汇节点（至少4个）
   - 触发条件
   - 交汇方式
   - 产生的后果与爽点

5. 伏线埋设与回收计划表`,
    maxTokens: 6144,
  });

  await writeBible(title, {
    timeline: { content: result, generatedAt: new Date().toISOString() },
  });

  extractAndSaveGraph(title, result, "时间线设计").catch(
    e => process.stderr.write(`[timeline] 图谱提取失败: ${e}\n`)
  );

  return result;
}
