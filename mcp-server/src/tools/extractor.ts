import { callGeminiExtract as callClaude } from "../api/claude.js";
import {
  upsertEntities,
  upsertRelations,
  NovelEntity,
  NovelRelation,
  NovelEntityType,
} from "../state/novel-graph.js";

// ── 提取响应结构 ──────────────────────────────────────────
interface ExtractedGraph {
  entities:  Array<{
    name:         string;
    type:         NovelEntityType;
    attributes?:  Record<string, string>;
    observations?: string[];
    tags?:        string[];
  }>;
  relations: Array<{
    from:         string;
    to:           string;
    relationType: string;
    weight?:      number;
    notes?:       string;
  }>;
}

const EXTRACTION_SYSTEM = `你是一个结构化信息提取专家。
从给定的小说创作文档中，提取实体和关系，返回严格的 JSON 格式。

实体类型（type 字段只能用以下值）：
- character   角色（人物）
- location    地点（场所、地域）
- event       事件（大事件、转折点）
- item        道具/物品（重要器物、装备）
- faction     势力/组织（阵营、门派、团队）
- world_rule  世界规则（魔法体系、规则、机制、历史背景）
- plot_hook   伏笔（埋下的谜题、未解决的悬念）

返回格式（纯 JSON，不加 markdown 代码块）：
{
  "entities": [
    {
      "name": "实体名",
      "type": "类型",
      "attributes": { "键": "值" },
      "observations": ["事实1", "事实2"],
      "tags": ["标签1"]
    }
  ],
  "relations": [
    {
      "from": "实体A名",
      "to": "实体B名",
      "relationType": "关系（主动语态）",
      "weight": 0.8,
      "notes": "备注（可选）"
    }
  ]
}

注意：
- 只提取明确出现的实体，不要推断
- 关系用主动语态描述（"隶属于"、"触发"、"位于"、"认识"等）
- attributes 只放结构化属性（年龄、能力、阵营等具体值）
- observations 放描述性事实句子
- 如果没有关系，relations 返回空数组`;

/**
 * 从模块生成的 Markdown 文本中提取实体和关系，写入知识图谱
 * @param title       小说名
 * @param markdownText 模块生成的完整文本
 * @param sectionHint  提示当前是哪个模块，帮助 AI 聚焦
 */
export async function extractAndSaveGraph(
  title:       string,
  markdownText: string,
  sectionHint:  string
): Promise<{ entityCount: number; relationCount: number }> {
  // 文本太短或太长都截断到合理范围
  const text = markdownText.slice(0, 6000);

  let raw: string;
  try {
    raw = await callClaude({
      system:    EXTRACTION_SYSTEM,
      user:      `以下是《${title}》的【${sectionHint}】内容，请提取所有实体和关系：\n\n${text}`,
      maxTokens: 2048,
      // 提取任务用 Flash 模型节省成本，由 callGeminiExtract 自动选择
    });
  } catch (err) {
    process.stderr.write(`[extractor] 提取失败: ${err}\n`);
    return { entityCount: 0, relationCount: 0 };
  }

  // 清理 markdown 代码块（以防 AI 加了）
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let extracted: ExtractedGraph;
  try {
    extracted = JSON.parse(cleaned) as ExtractedGraph;
  } catch {
    process.stderr.write(`[extractor] JSON 解析失败，原始输出：${raw.slice(0, 200)}\n`);
    return { entityCount: 0, relationCount: 0 };
  }

  // 写入实体
  const entities = (extracted.entities ?? []).map(e => ({
    name:         e.name,
    type:         e.type,
    attributes:   e.attributes   ?? {},
    observations: e.observations ?? [],
    tags:         e.tags         ?? [],
    source:       "mcp_planning" as const,
  } satisfies Omit<NovelEntity, "id" | "createdAt" | "updatedAt">));

  // 写入关系
  const relations = (extracted.relations ?? []).map(r => ({
    from:         r.from,
    to:           r.to,
    relationType: r.relationType,
    weight:       r.weight  ?? 0.7,
    notes:        r.notes,
    source:       "mcp_planning" as const,
  } satisfies Omit<NovelRelation, "id" | "createdAt">));

  await upsertEntities(title, entities);
  await upsertRelations(title, relations);

  process.stderr.write(
    `[extractor] 《${title}》${sectionHint}：提取 ${entities.length} 实体，${relations.length} 关系\n`
  );

  return { entityCount: entities.length, relationCount: relations.length };
}
