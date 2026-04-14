import "dotenv/config";
import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { analyzeMarket }    from "./tools/market.js";
import { buildWorldview }   from "./tools/worldview.js";
import { designCharacters } from "./tools/characters.js";
import { designTimeline }   from "./tools/timeline.js";
import { buildStoryArc }    from "./tools/storyarc.js";
import { researchStyle }    from "./tools/style.js";
import { generateOutline }  from "./tools/outline.js";
import { generateChapters } from "./tools/chapters.js";
import { runOrchestrator, type OrchestratorMode } from "./tools/orchestrator.js";
import {
  graphSearch,
  getCharacterNetwork,
  checkConsistency,
  listPlotHooks,
  addGraphEntity,
  addGraphRelation,
} from "./tools/graph-tools.js";
import { startApiServer } from "./http/api.js";
import { NovelEntityType } from "./state/novel-graph.js";

// ── 工具定义列表 ──────────────────────────────────────
const TOOLS = [
  {
    name:        "analyze_market",
    description: "【模块1】分析小说题材的市场潜力，输出评估报告",
    inputSchema: {
      type: "object",
      properties: {
        title:   { type: "string", description: "小说名称" },
        genre:   { type: "string", description: "题材类型（如：诡异求生、都市异能）" },
        ability: { type: "string", description: "主角金手指/核心能力描述" },
      },
      required: ["title", "genre", "ability"],
    },
  },
  {
    name:        "build_worldview",
    description: "【模块2】构建小说世界观：规则体系、社会形态、金手指机制、伏线设计",
    inputSchema: {
      type: "object",
      properties: {
        title:   { type: "string", description: "小说名称" },
        premise: { type: "string", description: "核心设定（一两句话描述世界/主角的独特之处）" },
      },
      required: ["title", "premise"],
    },
  },
  {
    name:        "design_characters",
    description: "【模块3】设计人物体系：主角+配角+反派，包含性格、弧线、关系图（需先完成世界观）",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
      },
      required: ["title"],
    },
  },
  {
    name:        "design_timeline",
    description: "【模块4】设计多线时间线：大事件年表、各角色个人线、交汇节点（需先完成人物设定）",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
      },
      required: ["title"],
    },
  },
  {
    name:        "build_story_arc",
    description: "【模块5】规划前期故事走向：分幕结构、爽点清单、情感曲线（需先完成时间线）",
    inputSchema: {
      type: "object",
      properties: {
        title:     { type: "string", description: "小说名称" },
        wordCount: { type: "number", description: "前期字数目标（默认30万）" },
      },
      required: ["title"],
    },
  },
  {
    name:        "research_style",
    description: "【模块6】分析同类爆款文风，给出定制写作风格指导和示例段落",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
      },
      required: ["title"],
    },
  },
  {
    name:        "generate_outline",
    description: "【模块7】生成前N万字详细细纲，每章有场景/事件/对话/钩子（需先完成故事走向）",
    inputSchema: {
      type: "object",
      properties: {
        title:     { type: "string", description: "小说名称" },
        wordCount: { type: "number", description: "细纲覆盖的字数范围（默认10万）" },
      },
      required: ["title"],
    },
  },
  {
    name:        "generate_chapters",
    description: "【模块8】将细纲压缩为简洁章纲表格，含一致性检查（需先完成细纲）",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
      },
      required: ["title"],
    },
  },
  {
    name:        "create_novel_full",
    description: "【模块9·工作流】一键执行全部步骤，自动按顺序完成创作准备。full=全8步，quick=前5步，outline_only=跳过文风直接出纲",
    inputSchema: {
      type: "object",
      properties: {
        title:   { type: "string",  description: "小说名称" },
        premise: { type: "string",  description: "核心设定（一两句话）" },
        genre:   { type: "string",  description: "题材类型" },
        ability: { type: "string",  description: "主角金手指/核心能力" },
        mode:    {
          type: "string",
          enum: ["full", "quick", "outline_only"],
          description: "执行模式（默认 full）",
        },
      },
      required: ["title", "premise", "genre", "ability"],
    },
  },
  // ── 知识图谱工具 ──────────────────────────────────────
  {
    name:        "graph_search",
    description: "【图谱】搜索知识图谱中的实体（角色/地点/事件/规则/伏笔等）",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
        query: { type: "string", description: "搜索关键词" },
        type:  {
          type: "string",
          enum: ["character","location","event","item","faction","world_rule","plot_hook"],
          description: "实体类型过滤（可选）",
        },
      },
      required: ["title", "query"],
    },
  },
  {
    name:        "get_character_network",
    description: "【图谱】获取指定角色的完整关系网络（一跳邻居）",
    inputSchema: {
      type: "object",
      properties: {
        title:     { type: "string", description: "小说名称" },
        character: { type: "string", description: "角色名称" },
      },
      required: ["title", "character"],
    },
  },
  {
    name:        "check_consistency",
    description: "【图谱】检查知识图谱的一致性，发现孤立节点、悬空关系、重复实体等问题",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
      },
      required: ["title"],
    },
  },
  {
    name:        "list_plot_hooks",
    description: "【图谱】列出所有伏笔及其解决状态",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说名称" },
      },
      required: ["title"],
    },
  },
  {
    name:        "add_graph_entity",
    description: "【图谱】手动向知识图谱添加实体",
    inputSchema: {
      type: "object",
      properties: {
        title:        { type: "string", description: "小说名称" },
        name:         { type: "string", description: "实体名称" },
        type:         {
          type: "string",
          enum: ["character","location","event","item","faction","world_rule","plot_hook"],
          description: "实体类型",
        },
        observations: { type: "array", items: { type: "string" }, description: "关于该实体的事实列表" },
        attributes:   { type: "object", description: "结构化属性键值对（如 age: 22）" },
        tags:         { type: "array", items: { type: "string" }, description: "标签列表" },
      },
      required: ["title", "name", "type"],
    },
  },
  {
    name:        "add_graph_relation",
    description: "【图谱】手动向知识图谱添加实体间的关系",
    inputSchema: {
      type: "object",
      properties: {
        title:        { type: "string", description: "小说名称" },
        from:         { type: "string", description: "源实体名称" },
        to:           { type: "string", description: "目标实体名称" },
        relationType: { type: "string", description: "关系类型（主动语态，如 认识、隶属于、触发）" },
        weight:       { type: "number", description: "关系强度 0-1（默认 0.7）" },
        notes:        { type: "string", description: "备注（可选）" },
      },
      required: ["title", "from", "to", "relationType"],
    },
  },
] as const;

// ── Server 初始化 ─────────────────────────────────────
const server = new Server(
  { name: "novel-assistant", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── 列出工具 ──────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// ── 执行工具 ──────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    let text: string;

    switch (name) {
      case "analyze_market":
        text = await analyzeMarket(
          args.title as string,
          args.genre as string,
          args.ability as string
        );
        break;

      case "build_worldview":
        text = await buildWorldview(
          args.title   as string,
          args.premise as string
        );
        break;

      case "design_characters":
        text = await designCharacters(args.title as string);
        break;

      case "design_timeline":
        text = await designTimeline(args.title as string);
        break;

      case "build_story_arc":
        text = await buildStoryArc(
          args.title     as string,
          args.wordCount as number | undefined
        );
        break;

      case "research_style":
        text = await researchStyle(args.title as string);
        break;

      case "generate_outline":
        text = await generateOutline(
          args.title     as string,
          args.wordCount as number | undefined
        );
        break;

      case "generate_chapters":
        text = await generateChapters(args.title as string);
        break;

      case "create_novel_full":
        text = await runOrchestrator(
          args.title   as string,
          args.premise as string,
          args.genre   as string,
          args.ability as string,
          (args.mode   as OrchestratorMode) ?? "full"
        );
        break;

      // ── 知识图谱工具 ──────────────────────────────────
      case "graph_search":
        text = await graphSearch(
          args.title as string,
          args.query as string,
          args.type  as NovelEntityType | undefined
        );
        break;

      case "get_character_network":
        text = await getCharacterNetwork(
          args.title     as string,
          args.character as string
        );
        break;

      case "check_consistency":
        text = await checkConsistency(args.title as string);
        break;

      case "list_plot_hooks":
        text = await listPlotHooks(args.title as string);
        break;

      case "add_graph_entity":
        text = await addGraphEntity(
          args.title        as string,
          args.name         as string,
          args.type         as NovelEntityType,
          (args.observations as string[]) ?? [],
          (args.attributes   as Record<string, string>) ?? {},
          (args.tags         as string[]) ?? []
        );
        break;

      case "add_graph_relation":
        text = await addGraphRelation(
          args.title        as string,
          args.from         as string,
          args.to           as string,
          args.relationType as string,
          (args.weight as number) ?? 0.7,
          args.notes   as string | undefined
        );
        break;

      default:
        throw new Error(`未知工具: ${name}`);
    }

    return { content: [{ type: "text", text }] };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `❌ 执行失败：${msg}` }],
      isError: true,
    };
  }
});

// ── 启动 ──────────────────────────────────────────────
// 同时启动 HTTP API 服务器（供前端访问图谱）
const apiPort = parseInt(process.env.GRAPH_API_PORT ?? "3001", 10);
startApiServer(apiPort);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[novel-mcp-server] 已启动，等待 Claude 连接...\n");
