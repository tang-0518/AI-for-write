# AI for Write — AI 小说辅助创作工具

> **不是让 AI 替你写，是让 AI 陪你写。**

基于浏览器的 AI 长篇小说辅助创作工具。当前保持**前端本地优先**的数据工作流，同时已经内置一个可独立运行的 `backend/` Python 后端（复刻自 PlotPilot）；核心续写、接续、润色、改写、解释，以及章节摘要 / 提取 / 大纲现已由这套后端承接。

![Version](https://img.shields.io/badge/version-0.6.2-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20TypeScript%20%2B%20Vite-blueviolet)
![AI](https://img.shields.io/badge/AI-Gemini%202.5-orange)
![Storage](https://img.shields.io/badge/storage-100%25%20local%20IndexedDB-green)
![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20Python-teal)

---

## 能做什么

你写几行，AI 接着写；你定方向，AI 帮你填细节。

**AI for Write** 像一个记得所有剧情的搭档——它知道你的角色是谁，记得前面发生了什么，能看懂你的写作风格，在你卡壳的时候随时接上。现在既能保持本地写作体验，也已经具备向后端化架构演进的基础。

```
你写：  "她踏入雨中，心跳加速，知道他正在注视着——"
AI 写：  [3 段张力十足的续写，匹配你的文风、角色设定与前情]
你决定：Tab 接受 · Esc 拒绝 · 这是你的故事
```

---

## 更新历史

### v0.6.2（当前）

**本版本最大变化：章节完成 AI 也切到 Python backend/editor API。**

| 模块 | 变更 |
|------|------|
| 🧠 **章节完成后端化** | `chapter-summary / chapter-extract-all / chapter-extract-entities / outline` 统一改走 `backend/interfaces/api/v1/engine/editor_routes.py` |
| 🔁 **前端 API 兼容** | `src/api/gemini.ts` 保留原有函数出口，`useChapterComplete.ts`、`completeChapter.ts`、`useOutline.ts` 不需要重写 |
| 🧱 **Python 分析服务** | 新增 `chapter_generation_service.py`，在后端负责章节摘要、记忆/图谱提取、实体过滤与大纲生成 |
| ✅ **逐步验证通过** | `python -m compileall ...`、路由导入校验、`npm run build` 全部通过 |

### v0.6.1

**本版本最大变化：前端核心编辑器 AI 全部切到 Python backend/editor API。**

| 模块 | 变更 |
|------|------|
| ✍️ **核心续写后端化** | `continue / resume / polish / rewrite / explain` 统一改走 `backend/interfaces/api/v1/engine/editor_routes.py` |
| 🔁 **前端调用兼容** | `src/api/gemini.ts` 保留原有导出签名，`useEditor.ts` 和现有 UI 不需要重写 |
| 🧱 **Python Prompt 承接** | 新增 `editor_generation_service.py`，在后端完成续写、润色、改写、解释 prompt 组装 |
| 🛠 **构建链修复** | `vite.config.ts` 兼容链接工作区真实路径，`npm run build` 可通过 |

### v0.6.0

**本版本最大变化：并入 PlotPilot 风格 Python 后端，为服务化改造打基础。**

| 模块 | 变更 |
|------|------|
| 🐍 **Python 后端并仓** | 新增 `backend/`，迁入 PlotPilot 的 `application / domain / infrastructure / interfaces` DDD 四层 |
| 🚀 **FastAPI 入口** | 保留 `interfaces.main:app` 与 `/health`、`/docs` 等后端入口，支持独立运行 |
| 🧰 **后端启动脚本** | 新增 `backend/start.ps1`，根目录 `dev-start.ps1` 可选拉起 Python 后端 |
| 📚 **工程文档同步** | 更新 `PLAN.md`、`ARCHITECTURE.md`、README，明确当前仓库已进入前端 + 后端双轨演进 |

### v0.4.0

**本版本最大变化：知识图谱完全内置，不再依赖外部 MCP Server。**

| 模块 | 变更 |
|------|------|
| 🕸 **知识图谱内置化** | 图谱数据从 MCP Server JSONL 迁移到本地 IndexedDB，无需启动任何额外服务 |
| 🧩 **完成章节自动建图** | 章节完成流程新增第3步：AI 自动提取实体和关系，写入图谱 |
| 🔌 **去除 MCP 依赖** | `useNovelGraph` 重写为纯 IndexedDB 版本，消除所有 HTTP 调用 |
| 🛠 **章节完成流程重构** | `useChapterComplete` Hook 拆分为纯函数 `completeChapter()`，逻辑更清晰，4步独立容错 |
| 🧠 **记忆服务升级** | `memoryService.ts` 的角色/世界数据源从 MCP API 切换为直接读取 IndexedDB 图谱 |
| 💡 **Gemini 2.5 兼容** | 修复 2.5 Pro 无法关闭 thinking 导致 token 被截断的问题，摘要和提取任务全部使用 `withNoThinking` |

### v0.3.0-beta

| 模块 | 变更 |
|------|------|
| 🎨 **文风学习** | 上传参考文章，AI 提炼风格档案，后续续写自动融入 |
| 🧩 **模块化写作** | 支持分场景/分视角写作，各模块独立上下文 |
| ⚙️ **Prompt 工程优化** | 系统 Prompt 重构，减少幻觉，提升续写一致性 |

### v0.2.0

| 模块 | 变更 |
|------|------|
| 🕸 **知识图谱（MCP 版）** | 引入本地 MCP Server，2D 力导向图谱，实体关系可视化 |
| 👤 **角色胶囊系统** | 角色档案独立管理，一键注入 Prompt |
| 🎣 **伏笔追踪器** | 创建 / 状态流转 / 紧急度标记 |
| 🧠 **右侧记忆侧边栏** | AI 上下文看板、章节摘要、笔记、图谱内嵌 |
| 📐 **侧边栏子视图** | 角色管理在侧边栏内切换，无弹窗跳转 |

### v0.1.0（初始版本）

- AI 续写（流式输出）+ 润色（选段重写对比）
- 多版本续写（3个方向供选择）
- 长期记忆系统（角色/世界观/笔记 + 关键词评分）
- 书籍 & 章节管理（多书多章，拖拽排序，800ms 自动保存）
- 版本快照（支持回滚）
- 大纲画布（AI 生成章节建议）
- 跨章全文搜索

---

## 核心功能

### AI 写作引擎
- **续写** — 流式输出，融合记忆库 + 近章摘要 + 知识图谱 + 文风档案
- **润色** — 选段重写，原文 / 润色版并排对比后接受
- **多版本续写** — 一次生成 3 个不同方向供选择
- **随时中断** — 流式中断，不等待

### 知识图谱系统（IndexedDB 内置）
- **2D 力导向图谱** — 自动布局，节点拖拽，侧边栏内嵌显示
- **7种实体类型** — 角色 / 势力 / 道具 / 地点 / 事件 / 世界规则 / 伏笔
- **自动建图** — 完成章节时 AI 自动提取实体和关系
- **智能合并** — 同名实体自动合并，不产生重复条目
- **完全本地** — 数据存在 IndexedDB，无需启动任何服务

### 长期记忆系统
- 存储人物、世界观、写作规则、章节摘要
- 关键词相关性评分，自动筛选最相关内容注入 Prompt
- 上下文超限时自动压缩为摘要
- AI 上下文看板实时显示 token 分布

### 角色胶囊系统
- 每位角色独立档案：身份 / 性格 / 说话风格 / 外貌 / 目标
- 一键生成写作上下文片段注入编辑器
- 知识图谱节点点击自动打开对应角色详情

### 书籍 & 章节管理
- 多书多章层级，拖拽排序
- 800ms 自动保存（IndexedDB）
- 跨章全文搜索（`Ctrl+Shift+F`）
- 版本快照，支持回滚
- 大纲画布，AI 生成章节建议

### 隐私优先
- **本地优先** — 书籍、章节、记忆、图谱仍存于浏览器本地；核心 AI 编辑请求通过本地 Python 后端转发
- API Key 仅存于 `localStorage`，直接发往 Google API
- 所有稿件数据存于本地 IndexedDB

---

## 快速开始

### 环境要求
- Node.js 18+
- [Gemini API Key](https://aistudio.google.com/app/apikey)（Google AI Studio 免费申请）

### 本地运行

```bash
git clone https://github.com/tang-0518/AI-.git
cd AI-
npm install
npm run dev
```

打开 `http://localhost:5173` → 设置中粘贴 API Key → 开始写作。

### 启动 Python 后端（推荐，核心 AI 功能必需）

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn interfaces.main:app --host 127.0.0.1 --port 8005 --reload
```

启动后可访问：

- `http://127.0.0.1:8005`
- `http://127.0.0.1:8005/docs`
- `http://127.0.0.1:8005/health`

### 静态部署（免费）

```bash
npm run build
# 将 dist/ 上传至 Vercel / Netlify / GitHub Pages
```

> v0.4 起知识图谱完全内置于前端，静态部署也能使用全部功能。

### 环境变量预填 API Key（可选）

```bash
# .env.local（不会提交到 git）
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-2.5-pro
VITE_PY_BACKEND_URL=http://127.0.0.1:8005
```

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | AI 续写 |
| `Ctrl + Shift + Enter` | AI 润色 |
| `Tab` | 接受 AI 建议 |
| `Esc` | 拒绝 / 中断流式输出 |
| `Ctrl + F` | 查找 |
| `Ctrl + H` | 查找 & 替换 |
| `Ctrl + Shift + F` | 全书搜索 |
| `Ctrl + =` / `-` | 字号放大 / 缩小 |
| `Ctrl + S` | 手动保存 |
| `?` | 查看全部快捷键 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| AI 模型 | Google Gemini API（由前端或本地 Python 后端转发） |
| 本地存储 | IndexedDB（v6，8 个 object store） |
| 可选后端 | Python 3.12 + FastAPI（`backend/`，承接续写与章节完成 AI） |
| 样式 | 纯 CSS，深色主题，5 套主题配色 |

---

## 项目结构

```
src/
├── api/
│   ├── gemini.ts              # Gemini 流式续写 + 所有 AI 调用
│   ├── memoryService.ts       # 上下文组装（IndexedDB 图谱 + 记忆）
│   ├── cache.ts               # 请求缓存
│   └── contextCompression.ts  # 长上下文自动压缩
├── graph/                     # 知识图谱（v0.4 内置）
│   ├── types.ts               # 实体 / 关系类型定义
│   ├── storage.ts             # IndexedDB CRUD + 智能合并
│   └── extractor.ts           # AI 提取实体关系 → 写入图谱
├── memory/
│   ├── types.ts               # 记忆条目类型
│   ├── storage.ts             # 记忆 CRUD + token 预算分配
│   └── completeChapter.ts     # 完成章节四步流程（纯函数）
├── capsule/                   # 角色胶囊类型定义
├── components/
│   ├── Editor.tsx             # 核心编辑器
│   ├── MemorySidebar.tsx      # 右侧侧边栏（图谱 / 角色 / 摘要 / 伏笔）
│   ├── MiniGraph.tsx          # 2D 力导向知识图谱（Canvas）
│   ├── GraphPanel.tsx         # 3D 全屏知识图谱（Canvas）
│   ├── CharacterPanel.tsx     # 角色管理面板（图谱 + 胶囊合并）
│   ├── PlotHooksPanel.tsx     # 伏笔追踪面板
│   ├── ChapterCompleteModal.tsx # 完成章节弹窗（4步进度）
│   └── ...
├── hooks/
│   ├── useEditor.ts           # 编辑器状态 + AI 调用
│   ├── useBooks.ts            # 书目 + 章节 CRUD
│   ├── useMemory.ts           # 记忆 CRUD + 上下文组装
│   ├── useNovelGraph.ts       # 知识图谱 Hook（IndexedDB 版）
│   ├── useCapsules.ts         # 角色胶囊 CRUD
│   └── usePlotHooks.ts        # 伏笔 CRUD
├── db/
│   └── index.ts               # IndexedDB 封装（v6，含图谱 store）
└── types.ts                   # 全局类型 + 默认设置
```

---

## 后续计划

- [ ] 时间线可视化（跨章节事件轴）
- [ ] 全书情节一致性检测（章节间逻辑矛盾自动标记）
- [ ] 段落改写模式（3种角度并排对比）
- [ ] 图谱全屏视图优化（分层布局，按实体类型着色）
- [ ] 移动端适配

---

## License

MIT — 自由使用、Fork、二次开发。
