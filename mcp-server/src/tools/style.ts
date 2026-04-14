import { callClaude }                       from "../api/claude.js";
import { readBible, writeBible, buildContext } from "../state/novel-bible.js";

export async function researchStyle(title: string): Promise<string> {
  const bible   = await readBible(title);
  const context = buildContext(bible);

  const result = await callClaude({
    system: `你是一位中国网络文学文风研究专家，深度研究过起点、番茄、七猫平台的头部作品写法。
你能分析爆款作品的文风特征，并针对具体小说给出定制化的写作风格指导。
输出格式：Markdown，使用中文，包含大量可直接参考的示例段落。`,
    user: `${context}

---
请为小说《${title}》进行文风研究与写作风格设计：

1. 对标爆款作品分析（3部同类作品）
   - 文风标签
   - 可借鉴的具体写法（带示例）

2. 本书推荐文风定位
   - 主基调比例（理性/情感/动作/悬疑等）
   - 核心文风原则（3-5条）

3. 章节开头套路库（3种不同开场方式+示例）

4. 爽点设计套路（5种类型+如何执行）

5. 对话写作规范（如何让对话有信息量）

6. 诡异/战斗/日常场景各自的描写技巧

7. 常见坑和避雷指南

8. 完整示例段落（针对本书第一章场景写一段500字示例）`,
    maxTokens: 8192,
  });

  await writeBible(title, {
    style: { content: result, generatedAt: new Date().toISOString() },
  });

  return result;
}
