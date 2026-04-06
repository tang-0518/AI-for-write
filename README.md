# AI for Write — Your AI Novel Co-Author

> **Stop staring at a blank page. Let AI write with you — not for you.**

A fully **browser-based** AI writing assistant for novels, stories, and long-form fiction. Powered by Google Gemini 2.5 Pro. Zero backend. Zero data leaks. Everything lives in your browser.

![Version](https://img.shields.io/badge/version-0.3.0--beta-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20TypeScript%20%2B%20Vite-blueviolet)
![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Pro-orange)
![Storage](https://img.shields.io/badge/storage-100%25%20local%20IndexedDB-green)

---

## 🚀 What It Does

You write a few sentences. AI continues. You decide what stays.

**AI for Write** acts like a co-author sitting next to you — it knows your characters, remembers your worldbuilding, matches your writing style, and keeps the story consistent across chapters. All without sending your manuscript to any cloud.

```
You write:  "她踏入雨中，心跳加速，知道他正在注视着——"
AI writes:  [3段张力十足的续写，匹配你的文风、人物设定与前情]
You decide: Tab 接受 · Esc 拒绝 · 这是你的故事
```

---

## ✨ What's New in v0.3 Beta

### 文风学习系统（Style Learning）

| Feature | Description |
|---------|-------------|
| 📖 **TXT 小说导入** | 智能分章节解析，支持"第X章/节/回/卷"及数字编号，序章自动识别 |
| 🎨 **AI 文风分析** | 选中任意章节，AI 分析8个维度：句式、对话、描写、视角、节奏、词汇、情感、独特规律 |
| 📂 **文风档案管理** | 保存多份分析档案，随时切换，支持重命名与删除 |
| ✍️ **仿写模式** | 开启后，续写 prompt 自动注入文风指令 + 范文段落，AI 输出贴近目标风格 |

### 模块化写作（Modular Writing）

| Feature | Description |
|---------|-------------|
| 🟪 **彩色写作分块** | 每次 AI 续写生成一个彩色块，最多10种颜色循环，直观区分每次创作范围 |
| 👁 **块颜色叠加层** | 编辑器内透明色块精准覆盖 AI 生成区域，不影响编辑体验 |

### Prompt 工程优化

| Feature | Description |
|---------|-------------|
| ⚙️ **systemInstruction 分离** | 角色设定与输出规则注入 Gemini `systemInstruction` 字段（可缓存），减少每次请求 token 消耗 |
| 🏷 **XML 结构化消息** | 续写请求采用 `<续写><约束><背景><前文>` XML 分段，各段独立控制 token 预算 |
| 📦 **分块润色** | 超长文本按段落边界切块，逐块串行润色，彻底解决长文润色 token 截断问题 |

### Bug Fixes

- 修复润色因 token 超限导致全文润色失效
- 修复小说导入部分章节分割错误（补全序章、加强章节正则）
- 修复大纲画布卡片颜色在各主题下显示异常
- 修复文风分析在 Gemini 2.5 Pro 思考模型下返回空值（正确过滤 `thought` parts）
- 修复模块化写作彩色层引发的 React `removeChild` DOM 异常

---

## 🧠 Core Features

### AI Writing Engine
- **Continue Writing** — 流式续写，融合记忆库、前章尾段、文风档案
- **Polish & Rewrite** — 选段润色，原文/润色版并排对比后接受
- **Multi-Version** — 生成3个不同续写版本供选择
- **Cancel anytime** — AbortController 随时中断流式输出

### Long-Term Memory System
- 存储人物、世界观、写作规则、风格偏好
- 关键词评分自动筛选最相关记忆注入 prompt
- 上下文超限时自动压缩旧内容为摘要
- 7个 Truth Files：`current_state` / `particle_ledger` / `pending_hooks` / `chapter_summaries` / `character_arcs` / `world_rules` / `timeline`

### Book & Chapter Management
- 多书多章层级，拖拽排序
- 800ms 自动保存（IndexedDB）
- 跨章全文搜索（`Ctrl+Shift+F`）
- 版本快照，支持置顶保护
- 大纲画布，AI 生成章节建议

### Privacy by Design
- **零后端** — 无服务器、无中转、无埋点
- API Key 仅存于 `localStorage`，只直接发往 Google API
- 所有稿件数据存于本地 **IndexedDB**

---

## ⚡ Quickstart

### 需要
- Node.js 18+
- [Gemini API Key](https://aistudio.google.com/app/apikey)（Google AI Studio 免费申请）

### 本地运行
```bash
git clone https://github.com/tang-0518/AI-.git
cd AI-
npm install
npm run dev
```

打开 `http://localhost:5173` → 在设置中粘贴 API Key → 开始写作。

### 部署（静态，免费）
```bash
npm run build
# 将 dist/ 上传至 Vercel / Netlify / GitHub Pages
```

### 可选：通过环境变量预填 API Key
```bash
# .env.local（不会提交到 git）
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-2.5-pro
```

---

## ⌨️ Keyboard Shortcuts

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
| `?` | 查看全部快捷键 |

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| AI | Google Gemini API（SSE 流式） |
| Storage | IndexedDB — 零后端 |
| Styling | Pure CSS，深色主题，5 套配色方案 |

---

## 📁 Project Structure

```
src/
├── api/
│   ├── gemini.ts              # Gemini 流式续写 + 润色（systemInstruction + XML prompt）
│   ├── styleAnalysis.ts       # 文风 AI 分析（思考模型兼容）     [NEW v0.3]
│   ├── cache.ts               # L1/L2 双层请求缓存
│   └── contextCompression.ts  # 长上下文自动压缩
├── components/
│   ├── Editor.tsx             # 核心编辑器（ghost 文字 + 模块化色块层）
│   ├── StyleLearningPanel.tsx # 文风学习面板（导入/分析/管理）   [NEW v0.3]
│   ├── OutlineCanvas.tsx      # 大纲画布（主题色修复）            [NEW v0.3]
│   ├── ImportPreviewModal.tsx # TXT 导入预览弹窗                  [NEW v0.3]
│   ├── Sidebar.tsx            # 书目 + 章节二级侧边栏
│   ├── MemoryPanel.tsx        # 长期记忆管理器
│   ├── StatsPanel.tsx         # 写作统计面板
│   └── VersionPickerPanel.tsx # 多版本选择面板
├── hooks/
│   ├── useEditor.ts           # 编辑器状态 + AI 调用 + 模块化写作块
│   ├── useStyleLearning.ts    # 文风档案 CRUD（IndexedDB）        [NEW v0.3]
│   ├── useBooks.ts            # 书目 + 章节 CRUD
│   └── useMemory.ts           # 记忆 CRUD + 相关性评分
├── types/
│   └── styleProfile.ts        # StyleProfile / StyleAnalysis 类型 [NEW v0.3]
├── utils/
│   ├── txtImport.ts           # TXT 智能分章节解析                [NEW v0.3]
│   └── settingsMigration.ts   # 设置 schema 版本迁移（v4）
└── types.ts                   # 全局类型 + DEFAULT_SETTINGS
```

---

## 🗺 Roadmap

- [ ] 对话生成面板
- [ ] 段落改写模式（3种角度）
- [ ] 伏笔追踪器（行内标注）
- [ ] 人物卡片系统（外貌 / 性格 / 关系网）
- [ ] 跨章时间线可视化
- [ ] 全书情节漏洞检测
- [ ] IndexedDB 统一仓储层抽象

---

## License

MIT — free to use, fork, and build on.
