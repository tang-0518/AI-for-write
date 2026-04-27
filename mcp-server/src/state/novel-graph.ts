import fs   from "fs/promises";
import path  from "path";
import { randomUUID } from "crypto";

// ── 实体类型 ──────────────────────────────────────────────
export type NovelEntityType =
  | "character"   // 角色
  | "location"    // 地点
  | "event"       // 事件
  | "item"        // 道具/物品
  | "faction"     // 势力/组织
  | "world_rule"  // 世界规则/设定
  | "plot_hook";  // 伏笔

export const ENTITY_TYPE_META: Record<NovelEntityType, { label: string; color: string; emoji: string }> = {
  character:  { label: "角色",     color: "#f87171", emoji: "👤" },
  location:   { label: "地点",     color: "#60a5fa", emoji: "📍" },
  event:      { label: "事件",     color: "#a78bfa", emoji: "⚡" },
  item:       { label: "道具",     color: "#fbbf24", emoji: "🗡️" },
  faction:    { label: "势力",     color: "#f472b6", emoji: "⚔️" },
  world_rule: { label: "世界规则", color: "#34d399", emoji: "🌍" },
  plot_hook:  { label: "伏笔",     color: "#fb923c", emoji: "🪝" },
};

// ── 核心数据结构 ──────────────────────────────────────────
export interface NovelEntity {
  id:           string;
  name:         string;
  type:         NovelEntityType;
  attributes:   Record<string, string>;  // 灵活键值对（年龄、能力、阵营等）
  observations: string[];                // 离散事实，参照官方 memory server 设计
  firstChapter?: number;                 // 首次出现章节
  tags:         string[];
  source:       "mcp_planning" | "writing_session" | "manual";
  createdAt:    string;
  updatedAt:    string;
}

export interface NovelRelation {
  id:           string;
  from:         string;   // 实体 name（与官方 server 一致，用 name 不用 id）
  to:           string;   // 实体 name
  relationType: string;   // 主动语态描述，如 "认识"、"隶属于"、"触发"
  weight:       number;   // 关系强度 0-1
  notes?:       string;
  chapter?:     number;
  source:       "mcp_planning" | "writing_session" | "manual";
  createdAt:    string;
}

// JSONL 存储行类型（每行一个对象）
type GraphLine =
  | ({ lineType: "entity" } & NovelEntity)
  | ({ lineType: "relation" } & NovelRelation);

export interface NovelGraph {
  novelTitle: string;
  entities:   NovelEntity[];
  relations:  NovelRelation[];
}

// ── 路径工具 ──────────────────────────────────────────────
function novelsDir(): string {
  return process.env.NOVELS_DIR
    ? path.resolve(process.env.NOVELS_DIR)
    : path.resolve("novels");
}

function graphFilePath(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, "_");
  return path.join(novelsDir(), safe, "graph.jsonl");
}

// ── 读取图谱 ──────────────────────────────────────────────
export async function readGraph(title: string): Promise<NovelGraph> {
  const filePath = graphFilePath(title);
  const graph: NovelGraph = { novelTitle: title, entities: [], relations: [] };

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as GraphLine;
        if (obj.lineType === "entity") {
          const { lineType, ...entity } = obj;
          void lineType;
          graph.entities.push(entity as NovelEntity);
        } else if (obj.lineType === "relation") {
          const { lineType, ...relation } = obj;
          void lineType;
          graph.relations.push(relation as NovelRelation);
        }
      } catch {
        // 跳过损坏行
      }
    }
  } catch {
    // 文件不存在，返回空图
  }

  return graph;
}

// ── 写入图谱（全量覆盖） ─────────────────────────────────
async function writeGraph(title: string, graph: NovelGraph): Promise<void> {
  const filePath = graphFilePath(title);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const lines: string[] = [];
  for (const entity of graph.entities) {
    lines.push(JSON.stringify({ lineType: "entity", ...entity }));
  }
  for (const relation of graph.relations) {
    lines.push(JSON.stringify({ lineType: "relation", ...relation }));
  }

  await fs.writeFile(filePath, lines.join("\n") + "\n", "utf-8");
}

// ── 实体操作 ──────────────────────────────────────────────

/** 新增或更新实体（按 name 去重） */
export async function upsertEntity(
  title:  string,
  entity: Omit<NovelEntity, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<NovelEntity> {
  const graph    = await readGraph(title);
  const now      = new Date().toISOString();
  const existing = graph.entities.find(e => e.name === entity.name && e.type === entity.type);

  if (existing) {
    // 合并 observations 和 attributes，不丢失旧数据
    const merged: NovelEntity = {
      ...existing,
      ...entity,
      id: existing.id,
      observations: Array.from(new Set([...existing.observations, ...entity.observations])),
      attributes:   { ...existing.attributes, ...entity.attributes },
      tags:         Array.from(new Set([...existing.tags, ...entity.tags])),
      updatedAt:    now,
    };
    graph.entities = graph.entities.map(e => e.id === existing.id ? merged : e);
    await writeGraph(title, graph);
    return merged;
  }

  const newEntity: NovelEntity = {
    ...entity,
    id:        entity.id ?? randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  graph.entities.push(newEntity);
  await writeGraph(title, graph);
  return newEntity;
}

/** 批量新增/更新实体 */
export async function upsertEntities(
  title:    string,
  entities: Array<Omit<NovelEntity, "id" | "createdAt" | "updatedAt">>
): Promise<NovelEntity[]> {
  const results: NovelEntity[] = [];
  for (const entity of entities) {
    results.push(await upsertEntity(title, entity));
  }
  return results;
}

/** 批量新增关系（幂等：from+to+relationType 相同时跳过） */
export async function upsertRelations(
  title:     string,
  relations: Array<Omit<NovelRelation, "id" | "createdAt">>
): Promise<void> {
  const graph = await readGraph(title);
  const now   = new Date().toISOString();

  for (const rel of relations) {
    const exists = graph.relations.some(
      r => r.from === rel.from && r.to === rel.to && r.relationType === rel.relationType
    );
    if (!exists) {
      graph.relations.push({ ...rel, id: randomUUID(), createdAt: now });
    }
  }

  await writeGraph(title, graph);
}

/** 删除实体及其关联关系 */
export async function deleteEntity(title: string, entityName: string): Promise<void> {
  const graph = await readGraph(title);
  graph.entities  = graph.entities.filter(e => e.name !== entityName);
  graph.relations = graph.relations.filter(r => r.from !== entityName && r.to !== entityName);
  await writeGraph(title, graph);
}

// ── 查询 ──────────────────────────────────────────────────

/** 按名称/类型/标签搜索实体 */
export function searchEntities(graph: NovelGraph, query: string, type?: NovelEntityType): NovelEntity[] {
  const q = query.toLowerCase();
  return graph.entities.filter(e => {
    const typeMatch = !type || e.type === type;
    const textMatch =
      e.name.toLowerCase().includes(q) ||
      e.observations.some(o => o.toLowerCase().includes(q)) ||
      Object.values(e.attributes).some(v => v.toLowerCase().includes(q)) ||
      e.tags.some(t => t.toLowerCase().includes(q));
    return typeMatch && textMatch;
  });
}

/** 获取某实体的所有关系（一跳邻居） */
export function getEntityNeighbors(
  graph:  NovelGraph,
  name:   string
): { entity: NovelEntity; relation: NovelRelation; direction: "out" | "in" }[] {
  const results: { entity: NovelEntity; relation: NovelRelation; direction: "out" | "in" }[] = [];

  for (const rel of graph.relations) {
    if (rel.from === name) {
      const target = graph.entities.find(e => e.name === rel.to);
      if (target) results.push({ entity: target, relation: rel, direction: "out" });
    } else if (rel.to === name) {
      const source = graph.entities.find(e => e.name === rel.from);
      if (source) results.push({ entity: source, relation: rel, direction: "in" });
    }
  }

  return results;
}

/** 获取未解决的伏笔列表 */
export function getOpenPlotHooks(graph: NovelGraph): NovelEntity[] {
  return graph.entities.filter(
    e => e.type === "plot_hook" && !e.attributes["resolved"]
  );
}

/** 将图谱摘要注入为上下文字符串（供 MCP 工具 prompt 使用） */
export function buildGraphContext(graph: NovelGraph): string {
  if (graph.entities.length === 0) return "";

  const sections: string[] = ["## 知识图谱摘要"];

  const byType = new Map<NovelEntityType, NovelEntity[]>();
  for (const e of graph.entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }

  for (const [type, entities] of byType) {
    const meta  = ENTITY_TYPE_META[type];
    const lines = entities.map(e => {
      const attrs = Object.entries(e.attributes)
        .map(([k, v]) => `${k}:${v}`)
        .join("、");
      const obs = e.observations.slice(0, 2).join("；");
      return `- **${e.name}**${attrs ? `（${attrs}）` : ""}${obs ? `：${obs}` : ""}`;
    });
    sections.push(`\n### ${meta.emoji} ${meta.label}（${entities.length}）\n${lines.join("\n")}`);
  }

  if (graph.relations.length > 0) {
    const relLines = graph.relations
      .slice(0, 20)
      .map(r => `- ${r.from} →[${r.relationType}]→ ${r.to}`);
    sections.push(`\n### 🔗 关系网络（展示前20条）\n${relLines.join("\n")}`);
  }

  return sections.join("\n");
}
