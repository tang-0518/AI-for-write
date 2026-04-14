import { callClaude }              from "../api/claude.js";
import { readBible, writeBible }  from "../state/novel-bible.js";

export async function analyzeMarket(
  title:    string,
  genre:    string,
  ability:  string
): Promise<string> {
  const bible = await readBible(title);

  const result = await callClaude({
    system: `你是一位资深网络文学市场分析师，专注于中国网文平台（起点、番茄、七猫）的题材热度与商业潜力分析。
输出格式：Markdown，使用中文，结构清晰，包含数据支撑与明确结论。`,
    user: `请对以下小说进行市场评估：

小说名称：${title}
题材类型：${genre}
主角能力/金手指：${ability}
${bible.worldview ? `\n已有世界观参考：\n${bible.worldview.content}` : ""}

请从以下维度输出评估报告：
1. 题材拆解与吸引力评分（1-10分）
2. 同类爆款对标分析（列举3-5部）
3. 差异化竞争优势
4. 潜在读者画像
5. 商业变现路径评估
6. 风险提示
7. 最终结论与建议`,
  });

  await writeBible(title, {
    market: { content: result, generatedAt: new Date().toISOString() },
  });

  return result;
}
