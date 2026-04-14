// =============================================================
// graph/extractor.ts — 从章节文本中提取知识图谱实体/关系
//
// 调用 Gemini API，解析 JSON，写入 IndexedDB
// =============================================================

import { callGemini, withNoThinking } from '../api/gemini';
import { upsertEntities, upsertRelations } from './storage';
import type { NovelEntityType } from './types';
import type { AppSettings } from '../types';

const EXTRACTION_SYSTEM = `你是一个结构化信息提取专家。
从给定的小说章节文本中，提取实体和关系，返回严格的 JSON 格式。

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

interface ExtractedGraph {
  entities:  Array<{
    name:          string;
    type:          NovelEntityType;
    attributes?:   Record<string, string>;
    observations?: string[];
    tags?:         string[];
  }>;
  relations: Array<{
    from:         string;
    to:           string;
    relationType: string;
    weight?:      number;
    notes?:       string;
  }>;
}

export async function extractAndSaveGraph(
  chapterTitle: string,
  chapterContent: string,
  bookId: string,
  settings: AppSettings,
): Promise<{ entityCount: number; relationCount: number }> {
  const text = chapterContent.slice(0, 6000);
  const prompt = `以下是《${chapterTitle}》的章节内容，请提取所有实体和关系：\n\n${text}`;

  let raw: string;
  try {
    raw = await callGemini(
      settings.apiKey,
      settings.model,
      `${EXTRACTION_SYSTEM}\n\n${prompt}`,
      withNoThinking(settings.model, { temperature: 0.1, maxOutputTokens: 4096 }),
    );
  } catch (err) {
    throw new Error(`图谱提取失败：${err instanceof Error ? err.message : String(err)}`);
  }

  // 清理 markdown 代码块
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let extracted: ExtractedGraph;
  try {
    extracted = JSON.parse(cleaned) as ExtractedGraph;
  } catch {
    throw new Error(`图谱 JSON 解析失败（原始输出：${raw.slice(0, 100)}…）`);
  }

  const entities = (extracted.entities ?? []).map(e => ({
    name:         e.name,
    type:         e.type,
    attributes:   e.attributes   ?? {},
    observations: e.observations ?? [],
    tags:         e.tags         ?? [],
    source:       'auto_extract' as const,
  }));

  const relations = (extracted.relations ?? []).map(r => ({
    from:         r.from,
    to:           r.to,
    relationType: r.relationType,
    weight:       r.weight ?? 0.7,
    notes:        r.notes,
    source:       'auto_extract' as const,
  }));

  await upsertEntities(bookId, entities);
  await upsertRelations(bookId, relations);

  return { entityCount: entities.length, relationCount: relations.length };
}
