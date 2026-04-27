import {
  readGraph,
  upsertEntity,
  upsertRelations,
  searchEntities,
  getEntityNeighbors,
  getOpenPlotHooks,
  NovelEntityType,
} from "../state/novel-graph.js";

// ── 图谱查询：搜索节点 ────────────────────────────────────
export async function graphSearch(
  title: string,
  query: string,
  type?: NovelEntityType
): Promise<string> {
  const graph   = await readGraph(title);
  const results = searchEntities(graph, query, type);

  if (results.length === 0) return `《${title}》图谱中未找到匹配"${query}"的实体。`;

  const lines = results.map(e => {
    const attrs = Object.entries(e.attributes).map(([k, v]) => `${k}: ${v}`).join("，");
    const obs   = e.observations.slice(0, 3).join("；");
    return [
      `### ${e.name}（${e.type}）`,
      attrs && `属性：${attrs}`,
      obs   && `观察：${obs}`,
      e.tags.length && `标签：${e.tags.join("、")}`,
    ].filter(Boolean).join("\n");
  });

  return `# 《${title}》图谱搜索：${query}\n\n共找到 ${results.length} 个实体\n\n${lines.join("\n\n")}`;
}

// ── 图谱查询：获取角色关系网络 ───────────────────────────
export async function getCharacterNetwork(
  title:     string,
  character: string
): Promise<string> {
  const graph     = await readGraph(title);
  const entity    = graph.entities.find(e => e.name === character);
  if (!entity) return `《${title}》图谱中未找到角色"${character}"。`;

  const neighbors = getEntityNeighbors(graph, character);

  const attrs = Object.entries(entity.attributes).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const obs   = entity.observations.map(o => `- ${o}`).join("\n");

  const outRels = neighbors
    .filter(n => n.direction === "out")
    .map(n => `- ${character} →[${n.relation.relationType}]→ **${n.entity.name}**（${n.entity.type}）${n.relation.notes ? `：${n.relation.notes}` : ""}`)
    .join("\n");

  const inRels = neighbors
    .filter(n => n.direction === "in")
    .map(n => `- **${n.entity.name}**（${n.entity.type}）→[${n.relation.relationType}]→ ${character}${n.relation.notes ? `：${n.relation.notes}` : ""}`)
    .join("\n");

  return [
    `# ${character} — 关系网络`,
    attrs && `\n## 属性\n${attrs}`,
    obs   && `\n## 已知事实\n${obs}`,
    outRels && `\n## 主动关系（${character} 发出）\n${outRels}`,
    inRels  && `\n## 被动关系（指向 ${character}）\n${inRels}`,
    neighbors.length === 0 && "\n_暂无关系记录_",
  ].filter(Boolean).join("\n");
}

// ── 图谱查询：一致性检查 ─────────────────────────────────
export async function checkConsistency(title: string): Promise<string> {
  const graph = await readGraph(title);

  const issues: string[] = [];

  // 检查1：关系中引用了不存在的实体
  const entityNames = new Set(graph.entities.map(e => e.name));
  for (const rel of graph.relations) {
    if (!entityNames.has(rel.from)) {
      issues.push(`⚠️ 关系 "${rel.from} →[${rel.relationType}]→ ${rel.to}" 中，"${rel.from}" 不在实体列表中`);
    }
    if (!entityNames.has(rel.to)) {
      issues.push(`⚠️ 关系 "${rel.from} →[${rel.relationType}]→ ${rel.to}" 中，"${rel.to}" 不在实体列表中`);
    }
  }

  // 检查2：孤立实体（无任何关系）
  const connectedNames = new Set([
    ...graph.relations.map(r => r.from),
    ...graph.relations.map(r => r.to),
  ]);
  const isolated = graph.entities.filter(
    e => !connectedNames.has(e.name) && e.type === "character"
  );
  if (isolated.length > 0) {
    issues.push(`ℹ️ 以下角色暂无关系：${isolated.map(e => e.name).join("、")}`);
  }

  // 检查3：重复实体名称（不同 type 但同名）
  const nameCounts = new Map<string, number>();
  for (const e of graph.entities) {
    nameCounts.set(e.name, (nameCounts.get(e.name) ?? 0) + 1);
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      issues.push(`⚠️ 实体名称 "${name}" 重复出现 ${count} 次，可能存在歧义`);
    }
  }

  // 检查4：未解决的伏笔
  const openHooks = getOpenPlotHooks(graph);
  if (openHooks.length > 0) {
    issues.push(`📌 未解决伏笔 ${openHooks.length} 个：${openHooks.map(e => e.name).join("、")}`);
  }

  const summary = [
    `# 《${title}》图谱一致性检查报告`,
    `\n**实体总数：** ${graph.entities.length}`,
    `**关系总数：** ${graph.relations.length}`,
    `**发现问题：** ${issues.filter(i => i.startsWith("⚠️")).length} 个`,
    `**提示信息：** ${issues.filter(i => !i.startsWith("⚠️")).length} 条`,
    issues.length > 0
      ? `\n## 详情\n${issues.join("\n")}`
      : "\n✅ 未发现一致性问题",
  ].join("\n");

  return summary;
}

// ── 图谱查询：伏笔列表 ───────────────────────────────────
export async function listPlotHooks(title: string): Promise<string> {
  const graph = await readGraph(title);
  const hooks = graph.entities.filter(e => e.type === "plot_hook");

  if (hooks.length === 0) return `《${title}》图谱中暂无伏笔记录。`;

  const open     = hooks.filter(h => !h.attributes["resolved"]);
  const resolved = hooks.filter(h =>  h.attributes["resolved"]);

  const fmt = (h: typeof hooks[0]) => {
    const obs = h.observations.join("；");
    return `- **${h.name}**${obs ? `：${obs}` : ""}`;
  };

  return [
    `# 《${title}》伏笔清单`,
    open.length     && `\n## ⏳ 待解决（${open.length}）\n${open.map(fmt).join("\n")}`,
    resolved.length && `\n## ✅ 已解决（${resolved.length}）\n${resolved.map(fmt).join("\n")}`,
  ].filter(Boolean).join("\n");
}

// ── 图谱操作：手动添加实体 ───────────────────────────────
export async function addGraphEntity(
  title:        string,
  name:         string,
  type:         NovelEntityType,
  observations: string[],
  attributes:   Record<string, string>,
  tags:         string[]
): Promise<string> {
  const entity = await upsertEntity(title, {
    name, type, observations, attributes, tags,
    source: "manual",
  });
  return `✅ 实体 "${entity.name}"（${entity.type}）已添加/更新到《${title}》知识图谱。`;
}

// ── 图谱操作：手动添加关系 ───────────────────────────────
export async function addGraphRelation(
  title:        string,
  from:         string,
  to:           string,
  relationType: string,
  weight:       number,
  notes?:       string
): Promise<string> {
  await upsertRelations(title, [{
    from, to, relationType,
    weight: Math.min(1, Math.max(0, weight)),
    notes,
    source: "manual",
  }]);
  return `✅ 关系 "${from} →[${relationType}]→ ${to}" 已添加到《${title}》知识图谱。`;
}

// ── 导出图谱摘要（供 orchestrator 汇报使用） ─────────────
export async function getGraphSummary(title: string): Promise<string> {
  const graph = await readGraph(title);
  const byType = new Map<string, number>();
  for (const e of graph.entities) {
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  }
  const typeLines = [...byType.entries()].map(([t, n]) => `  - ${t}: ${n}`).join("\n");
  return [
    `**知识图谱统计**`,
    `  - 实体总数: ${graph.entities.length}`,
    typeLines,
    `  - 关系总数: ${graph.relations.length}`,
    `  - 未解决伏笔: ${getOpenPlotHooks(graph).length}`,
  ].join("\n");
}
