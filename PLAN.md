# 墨韵 — 项目计划 & 更新记录

> **单一信息源**：所有功能计划、版本记录、设计决策均在此文件维护。  
> **最后更新：2026-04-27** · 当前版本：**v0.7.0-dev**  
> 状态标记：✅ 已完成 / 🔄 部分完成 / ⬜ 待做

---

## PlotPilot 全功能接入进度（v0.7 → v1.0）

| 步骤 | 内容 | 状态 |
|------|------|------|
| Step 1 | 后端目录差异审计 → 零缺失，后端 100% 已实现 | ✅ 已完成 2026-04-27 |
| Step 2 | 验证后端启动：.env 创建、DB 初始化、Gemini 激活、/health 200 OK | ✅ 已完成 2026-04-27 |
| Step 3 | 前端小说/章节 CRUD 双写后端：`src/api/novels.ts` + `useBooks.ts` 注入 | ✅ 已完成 2026-04-27 |
| Step 4 | 自动驾驶面板：`src/api/autopilot.ts` + `AutopilotPanel.tsx` | ⬜ 待做 |
| Step 5 | 文风分析接入后端 `/api/v1/novels/{id}/voice/` | ⬜ 待做 |
| Step 6 | 伏笔台账接入后端 `/api/v1/novels/{id}/foreshadow-ledger/` | ⬜ 待做 |
| Step 7 | 节拍表接入后端 `/api/v1/beat-sheets/` | ⬜ 待做 |
| Step 8 | 章节审查面板 `AuditPanel.tsx` + `/api/v1/chapter-reviews/` | ⬜ 待做 |
| Step 9 | 人物/地点接入后端 `/api/v1/bible/` | ⬜ 待做 |
| Step 10 | 知识图谱接入后端 `/api/v1/knowledge/` | ⬜ 待做 |

**设计约束**：IndexedDB 为前端主数据源，后端调用全部 fire-and-forget，失败不影响用户操作。

---

## 目录

1. [已完成功能](#1-已完成功能)
2. [待开发功能](#2-待开发功能)
3. [关键设计决策](#3-关键设计决策)
4. [执行约束](#4-执行约束)
5. [版本历史](#5-版本历史)

---

## 1. 已完成功能

### 编辑器与 AI 引擎

| 功能 | 核心文件 |
|------|---------|
| 流式续写（SSE + AbortController） | `api/gemini.ts` · `hooks/useEditor.ts` |
| 分块润色（rework / polish / anti-detect） | `api/gemini.ts` |
| 多版本续写（3 种角度选一） | `hooks/useEditor.ts` · `components/VersionPickerPanel.tsx` |
| 模块化写作（彩色块区分 AI 范围） | `hooks/useEditor.ts` · `components/Editor.tsx` |
| 行内 AI 菜单（选中文字触发润色/续写/解释） | `components/InlineAiMenu.tsx` |
| 润色 Diff 预览（词级对比，接受/拒绝） | `components/DiffPreview.tsx` · `utils/diffHighlight.ts` |
| 仿写模式（文风档案 + 范文注入） | `hooks/useStyleLearning.ts` · `api/styleAnalysis.ts` |
| 专注模式 + 打字机居中滚动 | `hooks/useFocusTimer.ts` · `hooks/useTypewriterScroll.ts` |
| L1/L2 双层缓存 + Prompt 分层 | `api/cache.ts` · `api/gemini.ts` |
| 正文自动压缩（长章节上下文保护） | `api/contextCompression.ts` |

### 记忆与知识系统

| 功能 | 核心文件 |
|------|---------|
| 记忆宫殿（角色/世界/摘要/笔记 + BM25 排序 + token 预算） | `memory/storage.ts` · `hooks/useMemory.ts` |
| 章节完成流程（摘要→合并提取→快照） | `memory/completeChapter.ts` |
| 单次 AI 合并提取（记忆 + 图谱同一次请求） | `api/gemini.ts::extractChapterAll` |
| 知识图谱（IndexedDB，7 类实体 + 关系，upsert 幂等） | `graph/types.ts` · `graph/storage.ts` · `graph/extractor.ts` |
| 3D 力导向图（Canvas 透视投影 + 因果链视图） | `components/GraphPanel.tsx` |
| Mini 图（侧边栏嵌入 + 实体高亮联动） | `components/MiniGraph.tsx` |
| 图谱 observations 注入续写上下文（【角色动态】） | `api/memoryService.ts::buildContextBundle` |
| 角色胶囊库（详细档案 + 场景上下文注入） | `hooks/useCapsules.ts` · `components/CapsulePanel.tsx` |
| 角色档案管理 UI | `components/CharacterPanel.tsx` |

### 界面与工程

| 功能 | 核心文件 |
|------|---------|
| 三栏布局（左书目 / 中编辑器 / 右侧边栏） | `components/layout/` · `App.tsx` |
| 右侧栏四 Tab（AI / 记忆 / 图谱 / 情节） | `components/layout/RightSidebar.tsx` |
| Zustand 全局 Store（AI 状态 + 面板管理） | `store/useNovelStore.ts` · `store/panelStore.ts` |
| 大纲画布（拖拽卡片 + AI 生成大纲） | `hooks/useOutline.ts` · `components/OutlinePanel.tsx` |
| 情节钩子管理（伏笔状态机） | `hooks/usePlotHooks.ts` · `components/PlotHooksPanel.tsx` |
| 快照版本历史 | `hooks/useSnapshots.ts` |
| AI 一致性检查 / 去 AI 化检测 | `components/ConsistencyPanel.tsx` · `utils/aiDetection.ts` |
| TXT 导入（智能分章节）/ 章节导出 | `utils/txtImport.ts` |
| 写作统计仪表盘 | `hooks/useWritingStats.ts` |
| 跨章节搜索 / 查找替换 | `components/CrossChapterSearch.tsx` · `components/FindReplace.tsx` |

### 后端与服务化

| 功能 | 核心文件 |
|------|---------|
| PlotPilot 风格 Python 后端子项目并仓 | `backend/application/` · `backend/domain/` · `backend/infrastructure/` · `backend/interfaces/` |
| 后端独立启动脚本 | `backend/start.ps1` |
| 一键开发脚本接入可选 Python 后端 | `dev-start.ps1` |
| 前端核心续写切换到 Python editor API | `backend/application/engine/services/editor_generation_service.py` · `backend/interfaces/api/v1/engine/editor_routes.py` · `src/api/gemini.ts` |
| 前端章节摘要/提取/大纲切换到 Python editor API | `backend/application/engine/services/chapter_generation_service.py` · `backend/interfaces/api/v1/engine/editor_routes.py` · `src/api/gemini.ts` |

---

## 2. 待开发功能

### P0 — 图谱补全（直接影响续写质量）

| # | 功能 | 问题 / 方案 |
|---|------|------------|
| ✅ G-1 | **关系注入续写上下文** | `memoryService.buildContextBundle` Section 6，120 token，按 weight 降序取 top 12 |
| G-2 | **跨章节关系强度更新** | `weight` 字段从不更新。`completeChapter` 末尾加后处理：同一 `from+to+relationType` 再次出现则 `weight += 0.05`，上限 1.0 |
| G-3 | **图谱实体与角色档案绑定** | `graph_entities` 和 `CharacterPanel` 是两套独立数据。`NovelEntity` 新增可选 `characterId?: string`；角色档案保存时写回 graph entity 的 `attributes` |

### P1 — 节拍模式（来自 PlotPilot，核心生成质量提升）

| # | 功能 | 方案 |
|---|------|------|
| ✅ B-1 | **节拍数据层** | `src/beats/types.ts`：Beat / BeatFocus / BEAT_FOCUS_META |
| ✅ B-2 | **节拍引擎** | `src/beats/beatEngine.ts`：magnifyOutlineToBeats（三层策略）+ buildBeatPrompt |
| ✅ B-3 | **节拍 Hook** | `src/hooks/useBeats.ts` |
| ✅ B-4 | **节拍面板 UI** | `src/components/BeatsPanel.tsx`：拖拽 + 手动添加 + 生成按钮 |
| ✅ B-5 | **节拍 Prompt 注入** | `api/gemini.ts::streamContinueWithBeat` |

### P2 — 张力评分（来自 PlotPilot）

| # | 功能 | 方案 |
|---|------|------|
| ✅ T-1 | **张力评分引擎** | `src/tension/types.ts` + `src/tension/scorer.ts::scoreChapterTension`，三维度（情节/情绪/节奏，0.4/0.3/0.3）|
| ✅ T-2 | **评分可视化** | `ChapterCompleteModal` 完成弹窗内显示三维进度条（颜色：<40红/40-70黄/>70绿）|
| ✅ T-3 | **章节状态追踪** | `src/chapterState/`：extractChapterState（9字段）+ persistChapterState（写入图谱+记忆）|

### P3 — 编辑器增强

| # | 功能 | 方案 |
|---|------|------|
| A-1 | **对话生成器** | `gemini.ts` 新增 `generateDialogue`；侧边栏追加对话草稿面板 |
| A-2 | **段落重写模式** | 选区 → 三种角度（叙事/心理/对话）重写，复用 DiffPreview |
| A-3 | **流式渲染性能** | `useEditor` 改用 `useRef` 积累 chunk + `requestAnimationFrame` 批量 flush |

### P4 — 知识系统深化

| # | 功能 | 方案 |
|---|------|------|
| K-1 | **伏笔追踪器** | 编辑器内嵌 `<mark>` 标注 + `useForeshadow` hook；与图谱 `plot_hook` 实体联动 |
| K-2 | **跨章节时间轴** | `TimelinePanel` 可视化故事内时间线；AI 从章节摘要提取时间节点写入 `event` 实体 |
| K-3 | **向量检索** | 项目已有向量数据库；`completeChapter` 时对 entity observations 做 embed，替换 BM25 的 context query |

### P5 — 架构优化

| # | 功能 | 方案 |
|---|------|------|
| C-1 | **IndexedDB 统一抽象** | 提取 `db/repository.ts` Repository 层；移除散落的 `dbGetAll`/`dbPut` 直调 |
| C-2 | **情节漏洞检测** | 全书知识图谱分析 → `PlotHolePanel` 报告 |

---

## 3. 关键设计决策

### 架构原则
- **前端本地优先 + 服务端并轨**：书籍、章节、记忆、图谱仍以 IndexedDB（`db/index.ts`）为主；核心 AI 续写链路与章节完成 AI 已切到 `backend/` 的 Python editor API
- **Prompt 分层**：`systemInstruction`（~120 tokens，稳定可缓存）+ user message（动态内容）
- **上下文预算**：总 1500 tokens，按角色 600 / 世界 300 / 摘要 400 / 笔记 200 / 角色动态 200 分配
- **图谱合并提取**：章节完成时单次 AI 调用同时写记忆宫殿 + 知识图谱（`extractChapterAll`），节省约 50% token

### 图谱存储规则
- 实体合并键：`bookId + name + type`（同名同类视为同一实体，追加 observations）
- 关系幂等键：`bookId + from + to + relationType`
- observations 上限 15 条（超出保留最新）

### Gemini Thinking Token 处理
- Gemini 2.5 Flash：续写/润色用 `withNoThinking`（`thinkingBudget: 0`），把配额还给正文
- Gemini 2.5 Pro：不可关闭 thinking，不要设 budget = 0（API 报 400）
- 模型最大输出：2.5 系列 65536 tokens，其余 8192 tokens

### 不引入的内容
- 全托管多章自动生成模式（PlotPilot 的 autopilot，不需要）
- Redux / MobX / Recoil（已选 Zustand）
- styled-components / emotion（用 CSS 变量 + Tailwind）
- lodash（原生实现 debounce 等工具）
- 立刻把书籍、图谱、记忆全部服务端化（当前先完成核心 AI 续写迁移，数据层仍保持本地优先）

---

## 4. 执行约束

1. 每项完成后跑 `tsc --noEmit -p tsconfig.app.json` 验证无类型错误
2. **核心函数保护**：`continueWriting` / `polishText`（`api/gemini.ts`）签名不改
3. IndexedDB schema 保持 v6，不新建 store（G-3 如需扩展字段可加列）
4. 单文件 ≤ 800 行，超出则拆模块
5. 完成后在 `ARCHITECTURE.md` 目录结构和改进日志章节同步更新

---

## 5. 版本历史

### v0.6.2（2026-04-17）**章节摘要/提取/大纲切换到 Python 后端**
- 新增 `backend/application/engine/services/chapter_generation_service.py`，在 Python 侧承接章节摘要、记忆/图谱提取、实体提取和大纲生成
- `backend/interfaces/api/v1/engine/editor_routes.py` 新增 `/api/v1/editor/chapter-summary`、`chapter-extract-all`、`chapter-extract-entities`、`outline`
- `src/api/gemini.ts` 将 `generateChapterSummary`、`extractChapterAll`、`extractChapterEntities`、`generateOutline` 转发到 Python 后端，并统一接入 `rewriteParagraph`、`explainText`
- 验证通过：`python -m compileall backend/application/engine/services/chapter_generation_service.py backend/interfaces/api/v1/engine/editor_routes.py backend/interfaces/main.py`、`npm run build`
关键文件：`backend/application/engine/services/chapter_generation_service.py` · `backend/interfaces/api/v1/engine/editor_routes.py` · `src/api/gemini.ts` · `src/App.tsx`

### v0.6.1（2026-04-17）**核心续写切换到 Python 后端**
- 新增 `backend/application/engine/services/editor_generation_service.py` 与 `backend/interfaces/api/v1/engine/editor_routes.py`，提供 `/api/v1/editor/continue-stream`、`resume-stream`、`polish`、`rewrite`、`explain`
- `src/api/gemini.ts` 的核心编辑器能力改为请求 Python 后端，保留 `useEditor.ts` 现有签名与 UI 流程不变
- 修复 `vite.config.ts` 在链接工作区下的真实路径构建问题，`npm run build` 可通过
关键文件：`backend/application/engine/services/editor_generation_service.py` · `backend/interfaces/api/v1/engine/editor_routes.py` · `src/api/gemini.ts` · `vite.config.ts`

### v0.6.0（2026-04-17）
**PlotPilot 后端并仓**
- 新增 `backend/`，迁入 PlotPilot 的 Python DDD 后端骨架（`application / domain / infrastructure / interfaces / scripts / tests`）
- 新增 `backend/start.ps1` 与 `backend/README.md`，后端可独立安装依赖并运行 `FastAPI`
- `dev-start.ps1` 接入可选 Python 后端启动与健康检查
- `README.md`、`ARCHITECTURE.md` 同步更新为“前端本地优先 + backend/ 服务端并轨”架构说明

关键文件：`backend/` · `dev-start.ps1` · `README.md` · `ARCHITECTURE.md`

### v0.5.0（2026-04-17）
**PlotPilot 核心机制移植**
- G-1：`buildContextBundle` Section 6，`graph_relations` 注入续写 Prompt（【角色关系】，top 12，120 token）
- B-1~5：节拍系统完整移植（`beats/types` · `beats/beatEngine` · `hooks/useBeats` · `BeatsPanel` · `streamContinueWithBeat`）
- T-1~2：张力评分引擎（`tension/types` · `tension/scorer`），`completeChapter` Step 5 异步评分，弹窗三维进度条展示
- T-3：章节状态追踪（`chapterState/extractor` · `chapterState/storage`），Step 6 自动写入图谱+伏笔
- `memory/types.ts` 新增 `plot_hook` 类型，伏笔条目持久化到 memories store

关键文件：`api/memoryService.ts` · `api/gemini.ts` · `memory/completeChapter.ts` · `beats/` · `tension/` · `chapterState/`

### v0.4.1（2026-04-17）
**图谱-记忆管线重构**（Codex 实施）
- 章节完成改为单次 AI 调用同时提取记忆 + 图谱（`extractChapterAll`）
- 记忆条目改为追加合并语义（相似内容去重，上限 600 字）
- BM25 相关度排序扩展到世界设定、章节摘要、笔记全类型
- 摘要不再硬限 3 条，改由 token 预算自然截断
- 批量 upsert N+1 问题修复（一次全量读取）
- observations 上限 15 条
- 提取时传入已有实体名，防止重复别称节点
- `memoryService.buildContextBundle` 追加【角色动态】段落（图谱 character observations）
- 首章序号 `firstChapter` 字段正确写入

### v0.4.0（2026-04-14）
**知识图谱内置化 + v0.5 前端架构**（Codex 实施）
- 知识图谱从 MCP Server 完全迁移到 IndexedDB，移除所有 HTTP 依赖
- 新建 `src/graph/`（types / storage / extractor）
- 三栏布局、Zustand Store、右侧四 Tab、行内 AI 菜单、Diff 预览、打字机滚动全部上线
- `useChapterComplete` 拆分为纯函数 `completeChapter()`
- 组件 prop 统一从 `novelTitle` 改为 `bookId`
- IndexedDB 升至 v6，新增 `graph_entities` / `graph_relations` store

### v0.3.0-beta（2026-04-12）
文风学习、模块化写作、Prompt 工程优化、L1/L2 缓存

### v0.2.0（2026-04-10）
AI for Write：续写/润色核心功能，多版本选择，仿写模式

### v0.1.0（初始发布）
基础编辑器、书目管理、记忆宫殿四分类、章节快照
