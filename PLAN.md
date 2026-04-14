# 小说辅助创作 — 项目计划

> **最后更新：2026-04-12**  
> 状态标记：✅ 已完成 / 🔄 进行中 / ⬜ 待做

---

## 参考来源

| 参考项 | 用途 | 文档 |
|--------|------|------|
| [tang-0518/AI-](https://github.com/tang-0518/AI-.git) | 项目起点，核心编辑器与记忆系统 | README.md |
| Claude Code 源码（compact.rs / system_prompt.rs） | 上下文压缩 + Prompt 分层缓存设计 | docs/context-compression-cache-design.md |
| MaaEnd 前端架构 | 大型面板组合、状态管理拆分参考 | — |
| MCP Memory Server（官方） | 知识图谱 JSONL 存储格式、实体/关系数据模型 | mcp-server/src/state/novel-graph.ts |

---

## 已完成功能

### 基础编辑器与 AI 引擎

| # | 功能 | 核心文件 |
|---|------|---------|
| — | 流式续写（SSE + AbortController） | api/gemini.ts · hooks/useEditor.ts |
| — | 分块润色（rework / polish / anti-detect） | api/gemini.ts |
| — | 多版本续写（3 种角度选一） | hooks/useEditor.ts · components/VersionPickerPanel.tsx |
| — | 模块化写作（彩色块区分 AI 生成范围） | hooks/useEditor.ts · components/Editor.tsx |
| — | 仿写模式（文风档案 + 范文注入） | hooks/useStyleLearning.ts · api/styleAnalysis.ts |
| — | L1/L2 双层缓存 + Prompt 分层 | api/cache.ts · api/gemini.ts |
| — | 正文自动压缩（长章节上下文截断保护） | api/contextCompression.ts |

### 记忆与知识系统

| # | 功能 | 核心文件 |
|---|------|---------|
| — | 记忆宫殿（角色/世界/摘要/笔记四分类） | memory/ · hooks/useMemory.ts |
| — | BM25 相关性评分 + Token 预算分配 | memory/storage.ts |
| — | 章节完成三步流程（摘要→实体→快照） | hooks/useChapterComplete.ts |
| — | 快照版本历史（重要标记 + 超限提示） | hooks/useSnapshots.ts |
| — | MCP 知识图谱服务器（实体/关系 JSONL） | mcp-server/src/state/novel-graph.ts |
| — | 知识图谱前端可视化（力导向 + 因果链） | components/GraphPanel.tsx |
| — | 角色胶囊库（详细档案 + 场景上下文注入） | hooks/useCapsules.ts · components/CapsulePanel.tsx |
| ✅ | **角色卡片系统**（图谱角色档案管理 UI） | components/CharacterPanel.tsx |

### 写作辅助工具

| # | 功能 | 核心文件 |
|---|------|---------|
| — | 大纲画布（拖拽卡片 + AI 生成大纲） | hooks/useOutline.ts · components/OutlinePanel.tsx |
| — | 情节钩子管理（伏笔状态机） | hooks/usePlotHooks.ts · components/PlotHooksPanel.tsx |
| — | 场景模板库（10 种内置模板，一键插入） | components/SceneTemplates.tsx |
| — | 专注模式 + 番茄钟 | hooks/useFocusTimer.ts · components/FocusModeOverlay.tsx |
| — | 快捷键帮助面板（`?` 触发） | components/ShortcutHelpPanel.tsx |
| — | 写作统计仪表盘（字数/AI 接受率） | hooks/useWritingStats.ts · components/StatsPanel.tsx |
| — | AI 一致性检查 | api/gemini.ts · components/ConsistencyPanel.tsx |
| — | 去 AI 化检测 | utils/aiDetection.ts · components/AiDetectionPanel.tsx |
| — | 跨章节搜索 | components/CrossChapterSearch.tsx |
| — | 查找替换 | components/FindReplace.tsx |
| — | TXT 导入（智能分章节） | utils/txtImport.ts |
| — | 章节导出（.txt / .md / 全书合并） | components/Toolbar.tsx |
| — | 一键排版（段首缩进 + 自动分段） | App.tsx handleFormat |

### 工程质量

| # | 功能 | 核心文件 |
|---|------|---------|
| — | 错误边界 + 离线检测 | components/ErrorBoundary.tsx · hooks/useOnlineStatus.ts |
| — | 设置版本迁移机制（schemaVersion） | utils/settingsMigration.ts |
| — | MCP HTTP 服务器（REST API + 图谱工具） | mcp-server/src/http/ · mcp-server/src/tools/ |

---

## 待完成

### A. 编辑器增强

| # | 类型 | 功能 | 核心改动 |
|---|------|------|---------|
| A-1 | 新功 | **对话生成器** | `gemini.ts` 新增 `generateDialogue`；`DialoguePanel` 根据场景+人物生成对话草稿 |
| A-2 | 新功 | **段落重写模式** | `RewritePanel` 提供「叙事角度/心理描写/对话改写」3 种角度重写选区 |
| A-3 | 优化 | **流式渲染性能** | `useEditor` 用 `useRef` 积累 chunk，`requestAnimationFrame` 批量 flush，减少重渲染 |
| A-4 | 优化 | **`useEditor` 冗余状态清理** | 移除 `pendingContinuationRef` 双轨，改用 ref + `streamVersion` 触发渲染 |

### B. 知识图谱深化

| # | 类型 | 功能 | 核心改动 |
|---|------|------|---------|
| B-1 | 新功 | **伏笔追踪器** | 编辑器内嵌 `<mark>` 标注 + `useForeshadow` hook + `ForeshadowPanel` 侧边栏；与知识图谱 `plot_hook` 实体联动 |
| B-2 | 新功 | **跨章节时间轴** | `TimelinePanel` 可视化故事内时间线；AI 辅助从章节摘要提取时间节点，写入知识图谱 `event` 实体 |
| B-3 | 新功 | **情节漏洞检测** | `gemini.ts` 新增 `detectPlotHoles`（全书知识图谱分析）+ `PlotHolePanel` 报告界面 |

### C. 架构优化

| # | 类型 | 功能 | 核心改动 |
|---|------|------|---------|
| C-1 | 优化 | **Token 预算精准控制** | `memory/storage.ts` 改用字节级中文 token 估算；加硬性截断保护，防止超预算请求 |
| C-2 | 优化 | **`App.tsx` 拆分** | 提取 `useAppState` hook 承接所有状态编排；`App.tsx` 降到纯渲染层（当前 ~900 行） |
| C-3 | 优化 | **IndexedDB 统一抽象** | 提取 `db/repository.ts` Repository 模式；所有 hook 改走类型安全接口，移除散落的 `dbGetAll`/`dbPut` 直接调用 |

---

## 执行规则

1. 每项完成后立即跑 `tsc --noEmit -p tsconfig.app.json` 验证无类型错误
2. 新组件 CSS 优先复用已有 class（`modal-backdrop` / `modal-panel` / `gp-*` 等），不新增大块样式
3. MCP 服务器修改后同步更新 `mcp-server/src/tools/` 和对应 HTTP 路由
4. 不破坏现有功能，每项改动范围最小化
5. 完成后在 **ARCHITECTURE.md 第 7 节（改进日志）** 追加记录
