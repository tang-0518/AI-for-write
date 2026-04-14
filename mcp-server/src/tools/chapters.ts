import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";

export async function generateChapters(title: string): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  if (!bible.outline) {
    throw new Error("请先完成细纲生成（generate_outline）");
  }

  const result = await callClaude({
    system: `你是一位专业的网络小说章纲整理师，擅长把详细细纲压缩成精准的章纲表格。
章纲是给作者看的"写作地图"：一眼能看出整体结构，又能快速定位某章的核心信息。
输出格式：Markdown表格 + 结构性文字，使用中文。`,
    user: `${context}

---
请基于以上细纲，为小说《${title}》生成简要章纲：

输出格式要求：
1. 总览表格（每行一章）：
   | 章序 | 章名 | 主视角 | 核心事件（一句话） | 当前环境 | 结尾钩子 |

2. 卷/幕分割线（每个大阶段单独一个小节）

3. 一致性检查表：
   - 世界设定是否前后一致
   - 人物行为是否符合设定
   - 伏线埋设与回收是否对应
   - 爽点分布是否均匀

4. 写作注意事项（针对这部小说的特殊提醒，5条以内）`,
    maxTokens: 8192,
  });

  await writeBible(title, {
    chapters: { content: result, generatedAt: new Date().toISOString() },
  });

  return result;
}
