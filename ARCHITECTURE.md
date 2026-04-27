# 小说辅助创作 — 架构文档 & 改进日志

> 本文件是项目的单一信息源（Single Source of Truth）。  
> 每次修改功能模块后，在「改进日志」章节追加一条记录。  
> 新增/删除文件时同步更新「目录结构」。
> 当前架构已演进为「前端本地优先 + `backend/` 可独立运行服务端」双轨结构。

---

## 目录

1. [技术栈](#1-技术栈)
2. [目录结构](#2-目录结构)
3. [分层架构](#3-分层架构)
4. [核心数据模型](#4-核心数据模型)
5. [关键数据流](#5-关键数据流)
6. [模块详解](#6-模块详解)
7. [改进日志](#7-改进日志)
8. [SOP：各模块修改指南](#8-sop各模块修改指南)

---

## 1. 技术栈

| 层级 | 技术 |
|------|------|
| UI 框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式 | 纯 CSS（单文件 `App.css`，CSS 变量主题系统）|
| 持久化 | IndexedDB（通过 `src/db/index.ts` 封装）|
| AI 接口 | Google Gemini API（`generativelanguage.googleapis.com`） + Python editor API（`/api/v1/editor/*`）|
| 状态管理 | React Hooks（无外部状态库）|
| 服务端（新增） | Python 3.12 + FastAPI + uvicorn（`backend/`，复刻 PlotPilot 后端骨架） |

---

## 2. 目录结构

```
【前端】src/
├── main.tsx                    # 入口，挂载 App
├── App.tsx                     # 根组件：组合所有 Hook + 渲染布局（~900 行，待拆分）
├── App.css                     # 全局样式（含 CSS 变量主题）
├── index.css                   # 基础重置
├── types.ts                    # 全局类型 & 常量（AppSettings, Book, Draft 等）
│
├── api/                        # AI 接口层（无状态，纯函数）
│   ├── gemini.ts               # 前端 AI 封装：核心编辑器能力转发到 Python editor API，其余仍保留 Gemini 调用
│   ├── cache.ts                # L1/L2 双层生成缓存（内存 Map + token 估算）
│   ├── contextCompression.ts   # 上下文压缩（章节过长时自动摘要）
│   └── styleAnalysis.ts        # 文风分析（imitation mode 用）
│
├── memory/                     # 记忆宫殿核心逻辑（纯 TS，无 React）
│   ├── types.ts                # MemoryEntry / MemoryType / MEMORY_TYPE_META / PlotHook
│   └── storage.ts              # CRUD + token 预算 + buildMemoryContextDetailed
│
├── db/                         # IndexedDB 封装
│   └── index.ts                # openDB / dbGetAll / dbPut / dbDelete / kvGet / kvSet
│
├── config/
│   └── constants.ts            # 全局常量（PREV_CHAPTER_TAIL_CHARS 等）
│
├── hooks/                      # React 业务 Hook（状态 + 副作用）
│   ├── useBooks.ts             # 书目 CRUD（多书管理）
│   ├── useDrafts.ts            # 章节 CRUD（属于某本书）
│   ├── useMemory.ts            # 记忆宫殿 Hook（读写 + 分组 + 上下文构建）
│   ├── useChapterComplete.ts   # 章节完成三步流程（摘要→实体→快照）
│   ├── useEditor.ts            # 编辑器状态（续写 / 润色流控制）
│   ├── useAutoSave.ts          # 自动保存（防抖 2 s）
│   ├── useSnapshots.ts         # 快照（版本历史）
│   ├── useStorage.ts           # 设置持久化（localStorage）
│   ├── useStyleLearning.ts     # 文风档案 CRUD
│   ├── useOutline.ts           # 大纲数据管理
│   ├── usePlotHooks.ts         # 伏笔 / 情节钩管理
│   ├── useNovelGraph.ts        # 知识图谱 HTTP 客户端（连接 MCP 服务器）
│   ├── useCapsules.ts          # 角色胶囊库 CRUD + 场景上下文构建
│   ├── useWritingStats.ts      # 字数统计 / 写作速度
│   ├── useKeyboardShortcuts.ts # 全局键盘快捷键注册
│   ├── useFocusTimer.ts        # 专注计时器
│   ├── useTheme.ts             # 主题切换（亮/暗）
│   └── useOnlineStatus.ts      # 网络状态监听
│
├── components/                 # React UI 组件（纯展示 + 局部状态）
│   ├── Editor.tsx              # 正文编辑器 + 流式续写渲染
│   ├── Sidebar.tsx             # 左侧书目 / 章节树
│   ├── Toolbar.tsx             # 顶部工具栏
│   ├── StatusBar.tsx           # 底部状态栏（字数 / 自动保存 / 在线状态）
│   ├── MemoryPanel.tsx         # 记忆宫殿面板（4 个列表标签 + 预览可视化）
│   ├── GraphPanel.tsx          # 知识图谱力导向可视化（角色层/世界线/因果链）
│   ├── CharacterPanel.tsx      # 角色卡片管理（图谱 character 实体）
│   ├── CapsulePanel.tsx        # 角色胶囊库（详细档案 + 场景注入）
│   ├── ChapterCompleteModal.tsx # 章节完成确认对话框（三步进度）
│   ├── SettingsModal.tsx       # 设置弹窗
│   ├── SnapshotPanel.tsx       # 快照历史面板
│   ├── OutlinePanel.tsx        # 大纲面板
│   ├── OutlineCanvas.tsx       # 大纲画布（思维导图式）
│   ├── PlotHooksPanel.tsx      # 伏笔面板
│   ├── AiSuggestionPanel.tsx   # AI 续写建议面板（多版本选择）
│   ├── AiDetectionPanel.tsx    # AI 痕迹检测面板
│   ├── ConsistencyPanel.tsx    # 一致性检查面板
│   ├── CrossChapterSearch.tsx  # 跨章节搜索
│   ├── StyleLearningPanel.tsx  # 文风学习面板
│   ├── InstructionBar.tsx      # 指令输入栏
│   ├── CommandBar.tsx          # 命令面板（快捷跳转）
│   ├── FindReplace.tsx         # 查找替换
│   ├── SceneTemplates.tsx      # 场景模板库
│   ├── FocusModeOverlay.tsx    # 专注模式遮罩
│   ├── StatsPanel.tsx          # 写作统计面板
│   ├── VersionPickerPanel.tsx  # 多版本选择器
│   ├── ImportPreviewModal.tsx  # TXT 导入预览
│   ├── ShortcutHelpPanel.tsx   # 快捷键帮助
│   ├── CreateBookModal.tsx     # 新建书籍弹窗
│   ├── ErrorBoundary.tsx       # 错误边界
│   └── CatPet.tsx              # 虚拟猫咪宠物
│
├── types/
│   └── styleProfile.ts         # 文风档案类型
│
├── capsule/                    # 角色胶囊类型（独立模块）
│   └── types.ts
│
└── utils/                      # 无状态工具函数
    ├── settingsMigration.ts    # 设置版本迁移（schemaVersion 递增）
    ├── aiDetection.ts          # AI 痕迹检测算法
    ├── txtImport.ts            # TXT 文件解析
    ├── date.ts                 # 日期格式化
    └── id.ts                   # ID 生成

【MCP 服务器】mcp-server/
├── src/
│   ├── index.ts                # MCP server 入口（工具注册）
│   ├── api/
│   │   └── claude.ts           # Claude API 客户端（规划阶段用）
│   ├── http/                   # REST HTTP 服务器（前端 useNovelGraph 调用）
│   │   └── server.ts           # Express 路由：/api/novels/:title/graph 等
│   ├── state/
│   │   ├── novel-graph.ts      # 知识图谱 JSONL 存储（实体 + 关系）
│   │   └── novel-bible.ts      # 小说圣经（世界观/角色/大纲等规划文档）
│   └── tools/                  # MCP 工具实现（供 Claude 桌面端调用）
│       ├── characters.ts       # 人物设计（Claude 生成 + 写入圣经 + 提取图谱）
│       ├── worldview.ts        # 世界观构建
│       ├── outline.ts          # 大纲生成
│       ├── timeline.ts         # 时间线设计
│       ├── storyarc.ts         # 故事弧
│       ├── market.ts           # 市场分析
│       ├── style.ts            # 文风研究
│       ├── chapters.ts         # 章节生成
│       ├── graph-tools.ts      # 图谱查询工具（get_character_network 等）
│       ├── extractor.ts        # 实体提取（从文本自动写入图谱）
│       └── orchestrator.ts     # 全流程编排（create_novel_full）
└── novels/                     # 数据目录（每部小说一个子目录）
    └── <书名>/
        ├── bible.json          # 小说圣经（规划文档聚合）
        └── graph.jsonl         # 知识图谱（每行一个实体或关系）

【Python 后端】backend/
├── application/               # 应用层：工作流、用例编排、服务聚合
├── domain/                    # 领域层：实体、值对象、仓储接口
├── infrastructure/            # 基础设施：SQLite / 向量库 / LLM Provider / Prompt
├── interfaces/                # FastAPI 入口与 REST 路由
├── scripts/                   # 迁移、守护进程、诊断工具
├── tests/                     # 后端测试
├── requirements.txt           # Python 依赖清单
├── .env.example               # 后端环境变量模板
└── start.ps1                  # Windows 后端启动脚本
```

> 当前书籍、章节、记忆与图谱仍默认走本地 IndexedDB；核心编辑器 AI 与章节完成 AI（摘要 / 提取 / 大纲）已切到 `backend/` 的 `/api/v1/editor/*`。

---

## 3. 分层架构

```
┌────────────────────────────────────────────────────────────────────┐
│  前端 UI 层（components/）                                          │
│  纯展示 + 局部 UI 状态，通过 props 接收数据与回调                  │
├────────────────────────────────────────────────────────────────────┤
│  前端业务 Hook 层（hooks/）                                         │
│  持有领域状态，协调 API / DB / 记忆的副作用                         │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│  Gemini 层   │  Memory 层   │  DB 层       │  Graph HTTP 层        │
│  api/*.ts    │  memory/*.ts │  db/index.ts │  hooks/useNovelGraph  │
│  纯函数/无状态│  纯 TS 逻辑  │  IndexedDB   │  → MCP HTTP 服务器    │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
                                                        ↕ REST API
┌────────────────────────────────────────────────────────────────────┐
│  MCP 服务器（mcp-server/）                                          │
│  双重身份：① Claude 桌面 MCP 工具  ② 前端知识图谱 REST API        │
├───────────────────────┬────────────────────────────────────────────┤
│  工具层（tools/）     │  状态层（state/）                           │
│  characters / outline │  novel-graph.ts  — JSONL 知识图谱           │
│  worldview / timeline │  novel-bible.ts  — 规划文档（世界观/角色）  │
│  extractor / graph    │                                             │
└───────────────────────┴────────────────────────────────────────────┘
                                    ↕ 文件读写
                        novels/<书名>/bible.json + graph.jsonl
```

**核心原则**
- `api/` 层不感知 React，不直接读 IndexedDB，只调用 Gemini HTTP。
- `memory/` 层不感知 React，不调用 Gemini，只做数据变换与 DB CRUD。
- `hooks/` 层是唯一可以同时调用 `api/` 和 `memory/` 的地方。
- `components/` 层不直接调用任何 `api/` 或 `memory/` 函数。
- MCP 服务器与前端**数据完全独立**：前端用 IndexedDB，MCP 用 JSONL 文件；两者通过知识图谱 REST API 同步角色/事件数据。

---

## 4. 核心数据模型

### IndexedDB Stores（`db/index.ts`，DB_VERSION = 4）

| Store | keyPath | 说明 |
|-------|---------|------|
| `books` | `id` | 书籍（`Book`）|
| `drafts` | `id` | 章节（含 `bookId` / `order` / `chapterSummary`）|
| `memories` | `id` | 记忆宫殿条目（`MemoryEntry`）|
| `style_profiles` | `id` | 文风档案 |
| `plot_hooks` | `id` | 伏笔 |
| `kv` | — | 通用键值（激活 ID / 排序数组）|

### 关键接口速查

```typescript
// types.ts
interface AppSettings {
  schemaVersion: number;        // 当前 = 5
  apiKey: string;
  style: WritingStyle;          // 'wuxia' | 'romance' | 'mystery' | 'scifi'
  model: string;                // 默认 'gemini-2.5-pro'
  writeLength: WriteLength;     // 'short' | 'medium' | 'long'
  creativity: CreativityLevel;  // 'precise' | 'balanced' | 'creative' | 'wild'
  memoryTokenBudget: number;    // 默认 1500
  imitationMode: boolean;
  imitationProfileId: string;
  modularWriting: boolean;
  // ...
}

// memory/types.ts
type MemoryType = 'character' | 'world_rule' | 'chapter_summary' | 'note';

interface MemoryEntry {
  id: string;
  name: string;
  description: string;
  type: MemoryType;
  content: string;
  updatedAt: number;            // Unix ms
  bookId?: string;              // 为空=全局，否则=书籍私有
  autoExtracted?: boolean;      // true = AI 自动提取（显示 🤖）
  chapterOrder?: number;        // chapter_summary 专用
}

// api/gemini.ts
interface ExtractedMemoryItem {
  type: 'character' | 'world_rule';
  name: string;
  content: string;
}
```

### Token 预算（续写，总 input ≈ 2200 tokens）

```
systemInstruction  : ~120
<约束>             :  ~40
<背景/记忆宫殿>    : max 1500  ← SECTION_BUDGETS 分配
  character        :  600
  world_rule       :  300
  chapter_summary  :  400
  note             :  200（用剩余预算）
<背景/文风>        : max 150   （imitation mode）
<背景/指令>        : max  80
<前文/前章>        : max 150   （usePrevChapterContext）
<前文/正文>        : ~700      （末尾 CONTEXT_TAIL_CHARS=2200 字符）
XML 结构标签       :  ~60
```

---

## 5. 关键数据流

### 5-A 续写流程

```
用户点击续写
  → useEditor.triggerContinuation()
  → 读取 memoryContext（useMemory.buildContextForQuery）
  → 读取 activeDraft.content（末尾 2200 字符）
  → 读取 prevChapter（可选）
  → api/gemini.streamContinuation()  ← 单次 stateless 调用
  → 流式写入 pendingText
  → 用户接受
  → useEditor.acceptContinuation()
      ├─ 追加文本到 draft
      ├─ 动态 import extractEntitiesFromAccepted()
      └─ upsertExtracted() → IndexedDB memories
```

### 5-B 章节完成流程（useChapterComplete）

```
用户点击 ✓ 完成章节
  → ChapterCompleteModal 打开
  → 用户确认 → execute()
      Step 1: generateChapterSummary()  → saveChapterSummary() → IndexedDB
      Step 2: extractChapterEntities()  → upsertExtracted()    → IndexedDB
      Step 3: onSaveSnapshot()                                 → IndexedDB
  → 状态 → 'done'
```

### 5-C 记忆宫殿注入流程

```
bookEntries（当前书 MemoryEntry[]）
  → buildMemoryContextDetailed(entries, query, totalBudget=1500)
      ├─ 按 type 分桶
      ├─ BM25-like 相关度排序（query 非空时）
      ├─ buildSection() 按 SECTION_BUDGETS 裁剪
      └─ 返回 { context, totalTokens, sections: SectionStat[] }
  → context 注入 Gemini prompt <背景/记忆> 区段
  → SectionStat[] 用于 MemoryPanel 预览可视化
```

### 5-D 设置迁移流程

```
应用启动
  → useStorage 读取 localStorage settings
  → migrateSettings(raw)
      ├─ v1 → v2: 补充 writeLength
      ├─ v2 → v3: 补充 creativity / wordGoal
      ├─ v3 → v4: 补充 imitationMode / modularWriting
      ├─ v4 → v5: 补充 memoryTokenBudget / 移除 'general' style
      └─ 写回 localStorage（带新 schemaVersion）
```

---

## 6. 模块详解

### `api/gemini.ts`

| 导出函数 | 用途 | 调用方 |
|----------|------|--------|
| `streamContinuation` | 流式续写，yield 文本块 | useEditor |
| `polishText` | 批量润色（分块），返回完整结果 | useEditor |
| `generateConsistencyCheck` | 一致性检查 | ConsistencyPanel |
| `generateChapterSummary` | 生成 ~150 字章节摘要 | useChapterComplete |
| `extractChapterEntities` | 从全章提取角色/世界设定 | useChapterComplete |
| `extractEntitiesFromAccepted` | 从单次续写提取实体（轻量） | useEditor（动态 import）|
| `analyzeWritingStyle` | 文风分析 | StyleLearningPanel |
| `TRUNCATION_SENTINEL` | 流截断哨兵值（'\x00TRUNCATED'）| useEditor 检测 |

**关键机制**
- 所有调用均为**单次无状态**请求，不携带历史 messages，不会跨轮次积累 token。
- Gemini 2.5 Flash：通过 `thinkingConfig: { thinkingBudget: 0 }` 禁用 thinking，将 output token 全还给正文。
- Gemini 2.5 Pro：不可关闭 thinking，`getModelMaxOutputTokens` 返回 65536 以留足空间。
- 润色超过 `POLISH_CHUNK_CHARS=2000` 字时自动分块，`rework`/`anti-detect` 模式携带前块末尾 200 字作为衔接上下文。

### `memory/storage.ts`

| 导出 | 说明 |
|------|------|
| `loadMemoriesAsync` | 从 IndexedDB 读取全部，按 updatedAt 降序，最多 500 条 |
| `upsertMemoryAsync` | 新增或更新（id 不存在则新建） |
| `deleteMemoryAsync` | 按 id 删除 |
| `estimateTokens` | `ceil(len / 1.5)`，中文 1 字 ≈ 1.5 token |
| `SECTION_BUDGETS` | `{ character:600, world_rule:300, chapter_summary:400, note:200 }` |
| `buildMemoryContextDetailed` | 构建注入上下文，同时返回可视化用 `SectionStat[]` |
| `buildMemoryContextForBook` | 简化版，只返回 context 字符串 |
| `scoreRelevance` | BM25-like 相关度评分（name 命中 +2，content 命中 +0.5）|

### `hooks/useMemory.ts`

- 按 `activeBookId` 隔离：`bookId === undefined` 的条目视为全局共享。
- `upsertExtracted`：按 `type + name + bookId` 去重，同名条目原地更新。
- `saveChapterSummary`：按 `chapterOrder + bookId` 去重，重复执行幂等。
- 每次写操作后调用 `clearGenerationCache()` 确保下次续写拿到最新记忆。

### `utils/settingsMigration.ts`

- 每次 `AppSettings` 结构变化时，同步递增 `SETTINGS_SCHEMA_VERSION`（当前 = 5）。
- 迁移函数必须**幂等**（可重复运行不副作用）。
- 迁移只追加字段，不删除旧字段（向后兼容）。

---

## 7. 改进日志

#### 2026-04-17 — backend/editor + src/api/gemini.ts — 章节完成 AI 切换到 Python 后端

- 新增 `backend/application/engine/services/chapter_generation_service.py`，在 Python 侧统一承接章节摘要、记忆/图谱提取、实体提取和大纲生成
- `backend/interfaces/api/v1/engine/editor_routes.py` 新增 `/api/v1/editor/chapter-summary`、`chapter-extract-all`、`chapter-extract-entities`、`outline`
- `src/api/gemini.ts` 将 `generateChapterSummary`、`extractChapterAll`、`extractChapterEntities`、`generateOutline` 改为调用本地 Python editor API，并补齐 `rewriteParagraph` / `explainText` 兼容导出
- 验证通过：`python -m compileall backend/application/engine/services/chapter_generation_service.py backend/interfaces/api/v1/engine/editor_routes.py backend/interfaces/main.py`、`npm run build`

#### 2026-04-17 — backend/editor + src/api/gemini.ts — 前端核心续写切换到 Python 后端

- 新增 `backend/application/engine/services/editor_generation_service.py`，在 Python 侧承接续写、接续、润色、改写、解释的 prompt 组装与模型调用
- 新增 `backend/interfaces/api/v1/engine/editor_routes.py`，暴露 `/api/v1/editor/continue-stream`、`resume-stream`、`polish`、`rewrite`、`explain`
- `src/api/gemini.ts` 改为将核心编辑器请求转发到 Python editor API，保留 `useEditor.ts` 现有调用签名
- `vite.config.ts` 新增真实路径 `root` 处理，修复链接工作区下的生产构建失败


> 格式：`#### YYYY-MM-DD — <模块名> — <一句话说明>`  
> 按日期倒序，最新在前。

---

#### 2026-04-17 — backend/ — 迁入 PlotPilot Python 后端骨架

**新增文件/目录**
- `backend/application/`
- `backend/domain/`
- `backend/infrastructure/`
- `backend/interfaces/`
- `backend/scripts/`
- `backend/tests/`
- `backend/requirements.txt`
- `backend/start.ps1`
- `backend/README.md`

**功能说明**
- 将 PlotPilot 的 DDD 四层后端整体并入当前仓库，保留 FastAPI 入口 `backend/interfaces/main.py`。
- 新增后端独立启动路径，支持通过 `backend/start.ps1` 或根目录 `dev-start.ps1` 拉起服务。
- 保留当前前端本地优先模式，不强制立即改写为服务端依赖，先完成后端落仓与后续对接基座。

---

#### 2026-04-12 — CharacterPanel — 新增角色卡片系统

**改动文件**
- `src/components/CharacterPanel.tsx`（新建）
- `src/components/Toolbar.tsx`（新增「👤 角色」按钮）
- `src/App.tsx`（懒加载 + `showCharacters` 状态 + 渲染面板）
- `src/App.css`（新增 `char-*` 样式类）

**功能说明**
- 双栏布局：左侧角色列表（搜索 + 新增），右侧详情卡片。
- 角色数据来源：知识图谱（`useNovelGraph`）中 `type="character"` 的实体，无重复 fetch。
- 属性自动按关键词分类（外貌 / 性格能力 / 其他），悬停显示删除按钮。
- 支持在线添加/删除属性（attributes）和观察事实（observations）。
- 关系网络区显示从 graph.relations 中过滤的关联，带方向箭头和章节号。
- MCP 离线时降级显示提示和启动命令。

---

#### 2026-04-12 — MCP 服务器 + 知识图谱前端 — 整体集成完成

**新增文件**
- `mcp-server/`（独立 Node.js 服务，双重身份：Claude MCP 工具 + 前端 REST API）
- `src/hooks/useNovelGraph.ts`（知识图谱 HTTP 客户端）
- `src/hooks/useCapsules.ts`（角色胶囊库）
- `src/components/GraphPanel.tsx`（力导向可视化，三标签：角色层/世界线/因果链）
- `src/components/CapsulePanel.tsx`（角色胶囊详细档案管理）

**功能说明**
- MCP 服务器暴露 REST API（`/api/novels/:title/graph` 等），前端通过 `useNovelGraph` 读写。
- 知识图谱使用 JSONL 格式存储，支持 7 种实体类型：character / location / event / item / faction / world_rule / plot_hook。
- GraphPanel 力导向布局，支持拖拽节点，点击查看关系详情，角色节点可跳转到胶囊库。
- CapsulePanel 与 useEditor 集成，`buildSceneContext` 在续写 prompt 中注入角色场景描述。

---

#### 2026-04-10 — MemoryPanel — 新增「预览」可视化标签页

**改动文件**
- `src/components/MemoryPanel.tsx`（新增 preview tab + `MemoryPreview` / `SectionCard` 子组件）
- `src/App.css`（新增 `.mem-preview-*` / `.mem-bar-*` / `.mem-sec-*` / `.mem-entry-*` 等样式类）

**功能说明**
- 第五个标签页「🔍 预览」：实时显示当前书目记忆宫殿向 AI 注入的内容与 token 用量。
- 堆叠彩色进度条：按角色/世界/摘要/笔记四色分段，直观显示各区段 token 占比。
- 分区卡片：每区显示 token 用量、mini 进度条、已收录条目（紫色 chip）、因预算不足被截断的条目（灰色删除线 chip）。
- 注入上下文原文：可折叠，显示实际拼接后发送给 Gemini 的完整字符串（字符数统计）。

**关键依赖**
- 调用 `buildMemoryContextDetailed(allEntries, '', 1500)` 取 `SectionStat[]`，`useMemo` 缓存，entries 变化时自动刷新。

---

#### 2026-04-10 — memory/storage.ts — 添加可视化数据结构

**改动文件**
- `src/memory/storage.ts`

**功能说明**
- 新增 `SectionStat` 接口：`{ type, label, color, included, excluded, tokens, budgetCap }`。
- 新增 `MemoryContextDetailed` 接口：`{ context, totalTokens, totalBudget, sections }`。
- 新增 `buildMemoryContextDetailed()`：将原 `buildMemoryContextForBook` 拆分，返回完整可视化数据。
- 修复原 `buildSection` 预算判断 Bug（`used + cost > used + 300` 总是比较 `cost > 300`，改为绝对上限比较）。
- token 估算公式由 `/ 1.8` 改为 `/ 1.5`，更贴近中文实际 token 率。

---

#### 2026-04-10 — memory/ — 记忆宫殿全系统重构（Memory Palace）

**改动文件**
- `src/memory/types.ts`（完全重写）
- `src/memory/storage.ts`（完全重写）
- `src/hooks/useMemory.ts`（完全重写）
- `src/hooks/useChapterComplete.ts`（完全重写）
- `src/components/MemoryPanel.tsx`（完全重写）
- `src/components/ChapterCompleteModal.tsx`（完全重写）
- `src/App.tsx`（多处更新）
- `src/hooks/useBooks.ts`（新增 `chapterSummary` 字段和 `updateChapterSummary` 方法）

**功能说明**
- 替换旧 TruthFileType（7 种）+ 手动触发系统，改为四类自动记忆：
  - `character`（角色档案）：续写被接受时轻量提取，章节完成时重量提取
  - `world_rule`（世界设定）：同上
  - `chapter_summary`（章节摘要）：仅在章节完成时生成（~150 字）
  - `note`（笔记）：纯手动
- 按 `bookId` 隔离，不同书互不干扰。
- 章节完成三步流程：摘要 → 实体 → 快照，带进度指示器。
- 自动去重：同 `type + name + bookId` 条目原地更新，不新增重复项。

---

#### 2026-04-10 — types.ts — 移除 'general' 写作风格

**改动文件**
- `src/types.ts`
- `src/utils/settingsMigration.ts`

**功能说明**
- `WritingStyle` 从 5 项移除 `'general'`，保留 `wuxia | romance | mystery | scifi`。
- `SETTINGS_SCHEMA_VERSION` 从 4 升至 5。
- v5 迁移：`style === 'general'` 自动改为 `'romance'`。

---

#### 2026-04-10 — api/gemini.ts — 润色模块 Token 修复

**改动文件**
- `src/api/gemini.ts`

**功能说明**
- `rework` / `anti-detect` 两种模式新增输出字数约束指令（「输出字数与原文相当」），防止被 maxOutputTokens 截断。
- 长文分块时 `rework` / `anti-detect` 携带前块末尾 200 字作为衔接上下文（`chunkMemory`），消除块间语义断裂。

---

## 8. SOP：各模块修改指南

> 「SOP」= 标准操作程序。每个模块的修改按此步骤执行，确保不遗漏边界影响。

---

### SOP-A 修改 AI Prompt（api/gemini.ts）

1. **确认影响范围**：续写 / 润色 / 摘要 / 实体提取 / 一致性检查，五条路径相互独立，修改一条不影响其他。
2. **修改 systemInstruction**：若要改角色定义或不变规则，在对应函数顶部的模板字符串内修改。
3. **修改 token 预算**：调整 `<约束>` 或各 `maxOutputTokens` 前，先核对注释头部的「Token 预算」表格，同步更新注释。
4. **Gemini 2.5 Flash 的 thinking**：创意任务（续写/润色）务必调用 `withNoThinking()` 包裹 generationConfig，否则 thinking token 会挤占正文输出。
5. **分块逻辑**：润色 > `POLISH_CHUNK_CHARS` 字时自动分块。修改衔接上下文长度，搜索 `chunkMemory` 变量。
6. **验证**：运行 `tsc --noEmit`，再在浏览器手动触发一次续写和一次润色确认无报错。

---

### SOP-B 修改记忆宫殿逻辑（memory/storage.ts + hooks/useMemory.ts）

1. **修改 token 预算分配**：编辑 `SECTION_BUDGETS` 常量，四个值之和建议不超过 1500（`memoryTokenBudget` 默认值）。
2. **新增记忆类型**：
   - 在 `memory/types.ts` 的 `MemoryType` union 中加入新类型。
   - 在 `MEMORY_TYPE_META` 中加入对应的 `{ label, emoji, desc, color }`。
   - 在 `SECTION_BUDGETS` 中加入预算（同步调整其他分区预算总和）。
   - 在 `buildMemoryContextDetailed` 中加入新分区的过滤与 `buildSection` 调用。
   - 在 `useMemory.ts` 中加入新类型的 `useMemo` 分组。
   - 在 `MemoryPanel.tsx` 的 `TABS` 数组和 `listMap` 中加入新标签页。
3. **修改相关度评分**：编辑 `scoreRelevance()` 函数，`name` 命中权重当前为 2，`content` 为 0.5。
4. **每次写操作后必须调用** `clearGenerationCache()` 确保下次续写拿到最新记忆。
5. **验证**：`tsc --noEmit` → 打开记忆宫殿面板 → 预览标签页核查 token 分配是否正确。

---

### SOP-C 修改章节完成流程（hooks/useChapterComplete.ts）

1. 当前三步顺序：摘要 → 实体 → 快照。若新增步骤，在 `ChapterCompleteProgress` 接口中加字段，在 `STEPS` 数组（`ChapterCompleteModal.tsx`）中加对应 UI 行。
2. 每步完成后立即 `setProgress(p => ({ ...p, [step]: true }))` 更新进度。
3. 任意步骤 throw 均会跳转到 `status === 'error'`，Modal 提供重试按钮。
4. 不要在 `execute()` 内部 catch 后继续执行后续步骤（fail-fast）。

---

### SOP-D 修改 AppSettings（types.ts + settingsMigration.ts）

1. 在 `AppSettings` 接口中新增字段（带类型和注释）。
2. 在 `DEFAULT_SETTINGS` 中给出默认值。
3. 在 `SETTINGS_SCHEMA_VERSION` 加 1。
4. 在 `settingsMigration.ts` 中新增一个 `if (v < N)` 迁移块，补填新字段的默认值。
5. **禁止**在迁移块中删除或重命名旧字段（向后兼容）。
6. 若旧字段需废弃，注释标注 `@deprecated since vN`，一个版本后再物理删除。

---

### SOP-E 修改 IndexedDB 结构（db/index.ts）

1. 递增 `DB_VERSION`（当前 = 4）。
2. 在 `req.onupgradeneeded` 回调中加 `if (!db.objectStoreNames.contains('xxx'))` 保护，**幂等**新增。
3. 若需要新增索引（`createIndex`），同样包裹在 `onupgradeneeded` 中。
4. 若 Store 有字段改动，写一个数据迁移函数在 `onupgradeneeded` 中遍历旧数据并 `put` 新格式。
5. 在 `StoreName` 联合类型中加入新 Store 名。
6. `dbReplaceAll` 是破坏性操作（先 clear 再写），只用于「整体替换」场景（如导入）。

---

### SOP-F 新增 UI 组件（components/）

1. 创建 `src/components/XxxPanel.tsx`，组件接收 props（不直接调用 API 或 DB）。
2. 所需数据从 `App.tsx` 通过 props 下传，在 `App.tsx` 中用对应 Hook 获取。
3. 样式写在 `App.css` 对应位置，使用 CSS 变量（`var(--text-primary)` 等）保持主题适配。
4. 新增 CSS 类时在 `App.css` 末尾对应注释区追加，附注释标题（`/* ── 新组件名 ─── */`）。
5. 若组件超过 200 行，考虑拆分子组件（保持在同一文件或新文件，视内聚程度决定）。
6. 更新本文档「目录结构」章节。

---

### SOP-G 调整写作风格（types.ts STYLE_CONFIGS）

1. 新增：在 `WritingStyle` union 中追加新值，在 `STYLE_CONFIGS` 中加对应 `{ label, prompt, emoji }`。
2. 删除：在 `WritingStyle` 中移除，在 `STYLE_CONFIGS` 中删除，**同时**在 `settingsMigration.ts` 中加迁移规则将旧值映射到默认值，递增 `SETTINGS_SCHEMA_VERSION`。
3. 在 `SettingsModal.tsx` 中对应的风格选择器会自动跟随 `STYLE_CONFIGS` 的键遍历，不需要手动维护列表。

---

*文档由开发团队维护，每次功能迭代后同步更新第 7 节（改进日志）和第 2 节（目录结构）。*
