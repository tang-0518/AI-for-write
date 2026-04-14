import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";
import { extractAndSaveGraph }               from "./extractor.js";

export async function designCharacters(title: string): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  if (!bible.worldview) {
    throw new Error("请先执行世界观构建（build_worldview）");
  }

  const result = await callClaude({
    system: `你是一位专业的中国网络小说人物设计师，擅长设计有血有肉、行为逻辑自洽、具有鲜明弧线的角色。
主角要有独特的行事逻辑和明确的底线，配角要有自己的目标和生命力，不能只是工具人。
输出格式：Markdown，使用中文。`,
    user: `${context}

---
请基于以上世界观，为小说《${title}》设计完整的人物体系：

1. 主角详细设定
   - 基本信息（姓名、年龄、外貌、出身）
   - 性格核心（表/里/行事逻辑/底线）
   - 金手指的具体使用规则与限制
   - 主角成长弧线（前期→中期→后期→终局）

2. 主要配角（3-5位）
   - 每位配角的身份、性格、与主角关系
   - 各自的故事弧线和隐藏信息

3. 对立型角色（反派/竞争者）

4. 人物关系图（文字版）

5. 每个主要角色的"标志性细节"（让读者记住他们的具体习惯/口头禅/行为）`,
    maxTokens: 8192,
  });

  await writeBible(title, {
    characters: { content: result, generatedAt: new Date().toISOString() },
  });

  extractAndSaveGraph(title, result, "人物设定").catch(
    e => process.stderr.write(`[characters] 图谱提取失败: ${e}\n`)
  );

  return result;
}
