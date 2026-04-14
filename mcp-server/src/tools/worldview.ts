import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";
import { extractAndSaveGraph }               from "./extractor.js";

export async function buildWorldview(
  title:   string,
  premise: string
): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  const result = await callClaude({
    system: `你是一位专业的奇幻/科幻世界观架构师，擅长为中国网络小说设计自洽、有深度、规则清晰的世界观体系。
要求：规则体系要有独创性，内部逻辑自洽，伏线设计合理，给后续剧情留下足够的扩展空间。
输出格式：Markdown，使用中文。`,
    user: `${context}

---
现在请为以下小说构建完整的世界观设定：

小说名称：${title}
核心设定：${premise}

请输出以下内容：
1. 核心背景事件（世界发生了什么）
2. 世界规则体系（主要规则、分级体系、运作逻辑）
3. 金手指/主角能力的具体机制（规则、限制、成长路线）
4. 社会形态（人类如何应对这个世界）
5. 故事主要舞台设定
6. 诡异/异能/特殊存在的种类索引（前期主要登场的）
7. 大时代背景线索（伏线，读者前期不知道的秘密）`,
    maxTokens: 8192,
  });

  await writeBible(title, {
    worldview: { content: result, generatedAt: new Date().toISOString() },
  });

  // 异步提取实体写入知识图谱（不阻塞返回）
  extractAndSaveGraph(title, result, "世界观设定").catch(
    e => process.stderr.write(`[worldview] 图谱提取失败: ${e}\n`)
  );

  return result;
}
