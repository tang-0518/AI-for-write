# 墨韵 · AI 辅助写作

> 一款完全运行在浏览器本地的 AI 小说辅助创作工具，数据存储在本地 IndexedDB，API Key 不经过任何服务器。

![License](https://img.shields.io/badge/license-MIT-blue)
![Tech](https://img.shields.io/badge/stack-React%2019%20%2B%20TypeScript%20%2B%20Vite-blueviolet)
![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Pro-orange)

## 功能特性

### 创作
- **AI 续写**：基于当前正文、记忆库、前章上下文自动续写，流式输出
- **AI 润色**：支持全文润色或选中片段润色，审核后一键接受/拒绝
- **多风格**：通用 / 武侠 / 言情 / 悬疑 / 科幻，随时切换
- **查找替换**：Ctrl+F 查找，Ctrl+H 替换，高亮跳转

### 书目管理
- **书 → 章节两级结构**：创建多本书，每本书独立管理章节
- **章节标题独立**：章节名与正文分开存储，不写入正文
- **拖拽排序**：章节支持拖拽重新排序
- **全书导出**：支持导出当前章节或全书为 `.txt` / `.md`

### 长期记忆库
- 手动录入人物设定、世界观、写作规则等长期背景
- 分为四类：`项目`（情节/人物）/ `反馈`（风格要求）/ `参考`（专有名词）/ `用户`（偏好）
- 每次续写按相关性自动注入，超出 Token 预算时压缩为摘要
- 中文关键词使用字符二元组匹配

### 上下文压缩
- 正文过长时自动压缩早期段落为摘要，保留完整写作窗口
- 压缩触发阈值、记忆 Token 预算均可在设置中调整
- 连续压缩失败自动熔断，状态栏实时显示压缩次数

### 数据安全
- 所有数据存储在**本地 IndexedDB**，刷新/关闭不丢失
- API Key 仅保存在本地 `localStorage`，不经过任何中间服务器
- 支持从旧版 localStorage 数据自动迁移

## 快速开始

### 前置条件

- Node.js 18+
- [Google AI Studio](https://aistudio.google.com/app/apikey) 获取 Gemini API Key（免费）

### 安装运行

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`，在设置中填入 Gemini API Key 即可使用。

### 构建部署

```bash
npm run build
# dist/ 目录即为静态文件，可部署到任意静态托管（Vercel / Netlify / GitHub Pages 等）
```

### 环境变量（可选）

创建 `.env.local`（不会被提交到 Git）：

```env
VITE_GEMINI_API_KEY=你的APIKey
VITE_GEMINI_MODEL=gemini-2.5-pro
```

填写后启动时会自动使用，无需每次在设置中输入。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| AI 接口 | Google Gemini API（SSE 流式）|
| 本地存储 | IndexedDB（drafts / books / memories）|
| 样式 | 纯 CSS，暗色主题 |

## 项目结构

```
src/
├── api/
│   ├── gemini.ts            # Gemini API 调用（续写 / 润色）
│   ├── cache.ts             # L1/L2 双层请求缓存
│   └── contextCompression.ts# 上下文自动压缩
├── components/
│   ├── Editor.tsx           # 核心编辑器（Ghost 文字 / 审核层）
│   ├── Sidebar.tsx          # 书目 + 章节两级侧边栏
│   ├── Toolbar.tsx          # 顶部工具栏 + 导出
│   ├── CommandBar.tsx       # 续写 / 润色指令栏
│   ├── MemoryPanel.tsx      # 记忆库管理面板
│   ├── FindReplace.tsx      # 查找替换
│   ├── SettingsModal.tsx    # 设置面板
│   ├── StatusBar.tsx        # 状态栏（字数 / 压缩状态）
│   └── CreateBookModal.tsx  # 新建书目弹窗
├── hooks/
│   ├── useBooks.ts          # 书目 + 章节管理（IndexedDB）
│   ├── useEditor.ts         # 编辑器状态 + AI 调用
│   ├── useMemory.ts         # 记忆库 Hook
│   └── useStorage.ts        # localStorage Hook（设置）
├── db/
│   └── index.ts             # IndexedDB 封装 + localStorage 迁移
├── memory/
│   ├── storage.ts           # 记忆 CRUD + 相关性评分
│   └── types.ts             # 记忆类型定义
└── types.ts                 # 全局类型
```

## License

MIT
