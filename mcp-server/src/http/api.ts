import express, { Request, Response, NextFunction } from "express";
import cors    from "cors";

// Express ParamsDictionary 的 string | string[] 兼容辅助
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}
import fs      from "fs/promises";
import path    from "path";
import {
  readGraph,
  upsertEntity,
  upsertRelations,
  deleteEntity,
  searchEntities,
  getEntityNeighbors,
  getOpenPlotHooks,
  NovelEntityType,
  ENTITY_TYPE_META,
} from "../state/novel-graph.js";
import { readBible } from "../state/novel-bible.js";

// ── 路径工具 ──────────────────────────────────────────────
function novelsDir(): string {
  return process.env.NOVELS_DIR
    ? path.resolve(process.env.NOVELS_DIR)
    : path.resolve("novels");
}

// ── Express 应用 ──────────────────────────────────────────
export function createApiApp(): express.Application {
  const app = express();

  app.use(cors({ origin: "*" }));
  app.use(express.json());

  // ── 列出所有小说 ────────────────────────────────────────
  app.get("/api/novels", async (_req: Request, res: Response) => {
    try {
      const dir     = novelsDir();
      let   entries: string[] = [];
      try {
        entries = await fs.readdir(dir);
      } catch {
        entries = [];
      }

      const novels = await Promise.all(
        entries.map(async name => {
          try {
            const bible = await readBible(name);
            const graph = await readGraph(name);
            return {
              title:       bible.meta.title,
              lastUpdated: bible.meta.lastUpdated,
              sections:    Object.keys(bible).filter(k => k !== "meta"),
              entityCount: graph.entities.length,
              relationCount: graph.relations.length,
            };
          } catch {
            return null;
          }
        })
      );

      res.json({ novels: novels.filter(Boolean) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 获取小说完整图谱 ────────────────────────────────────
  app.get("/api/novels/:title/graph", async (req: Request, res: Response) => {
    try {
      const graph = await readGraph(param(req.params.title));
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 获取图谱统计 ────────────────────────────────────────
  app.get("/api/novels/:title/graph/stats", async (req: Request, res: Response) => {
    try {
      const graph     = await readGraph(param(req.params.title));
      const byType    = new Map<string, number>();
      for (const e of graph.entities) {
        byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      }
      res.json({
        novelTitle:   graph.novelTitle,
        entityCount:  graph.entities.length,
        relationCount: graph.relations.length,
        byType:       Object.fromEntries(byType),
        openHooks:    getOpenPlotHooks(graph).length,
        entityTypes:  ENTITY_TYPE_META,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 搜索实体 ────────────────────────────────────────────
  app.get("/api/novels/:title/entities", async (req: Request, res: Response) => {
    try {
      const graph   = await readGraph(param(req.params.title));
      const query   = (req.query.q as string) ?? "";
      const type    = req.query.type as NovelEntityType | undefined;
      const results = query
        ? searchEntities(graph, query, type)
        : type
          ? graph.entities.filter(e => e.type === type)
          : graph.entities;
      res.json({ entities: results });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 获取单个实体 + 邻居 ─────────────────────────────────
  app.get("/api/novels/:title/entities/:name", async (req: Request, res: Response) => {
    try {
      const graph    = await readGraph(param(req.params.title));
      const name     = decodeURIComponent(param(req.params.name));
      const entity   = graph.entities.find(e => e.name === name);
      if (!entity) {
        res.status(404).json({ error: `实体"${name}"不存在` });
        return;
      }
      const neighbors = getEntityNeighbors(graph, name);
      res.json({ entity, neighbors });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 新增/更新实体（来自前端写作会话） ────────────────────
  app.post("/api/novels/:title/entities", async (req: Request, res: Response) => {
    try {
      const { name, type, attributes = {}, observations = [], tags = [] } = req.body as {
        name: string;
        type: NovelEntityType;
        attributes?: Record<string, string>;
        observations?: string[];
        tags?: string[];
      };
      if (!name || !type) {
        res.status(400).json({ error: "name 和 type 为必填项" });
        return;
      }
      const entity = await upsertEntity(param(req.params.title), {
        name, type, attributes, observations, tags,
        source: "writing_session",
      });
      res.json({ entity });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 新增关系 ────────────────────────────────────────────
  app.post("/api/novels/:title/relations", async (req: Request, res: Response) => {
    try {
      const { from, to, relationType, weight = 0.7, notes } = req.body as {
        from: string;
        to: string;
        relationType: string;
        weight?: number;
        notes?: string;
      };
      if (!from || !to || !relationType) {
        res.status(400).json({ error: "from、to、relationType 为必填项" });
        return;
      }
      await upsertRelations(param(req.params.title), [{
        from, to, relationType,
        weight: Math.min(1, Math.max(0, weight)),
        notes,
        source: "writing_session",
      }]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 删除实体 ────────────────────────────────────────────
  app.delete("/api/novels/:title/entities/:name", async (req: Request, res: Response) => {
    try {
      await deleteEntity(param(req.params.title), decodeURIComponent(param(req.params.name)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 获取 bible（文本摘要） ──────────────────────────────
  app.get("/api/novels/:title/bible", async (req: Request, res: Response) => {
    try {
      const bible = await readBible(param(req.params.title));
      // 只返回 meta + 各节摘要，不返回全文（可能很长）
      const sections: Record<string, { generatedAt: string; preview: string }> = {};
      for (const [key, val] of Object.entries(bible)) {
        if (key === "meta") continue;
        const v = val as { content: string; generatedAt: string };
        if (v?.content) {
          sections[key] = {
            generatedAt: v.generatedAt,
            preview:     v.content.slice(0, 200) + (v.content.length > 200 ? "…" : ""),
          };
        }
      }
      res.json({ meta: bible.meta, sections });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 健康检查 ────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version: "1.0.0", service: "novel-graph-api" });
  });

  // ── 错误处理 ────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    void next;
    process.stderr.write(`[api] 未捕获错误: ${err.message}\n`);
    res.status(500).json({ error: err.message });
  });

  return app;
}

export function startApiServer(port = 3001): void {
  const app = createApiApp();
  app.listen(port, "127.0.0.1", () => {
    process.stderr.write(`[novel-graph-api] HTTP API 已启动：http://127.0.0.1:${port}/api\n`);
  });
}
