# 小说辅助创作 — 功能与优化计划

> 按难易程度从低到高排列，逐项执行。
> 状态：⬜ 待做 / 🔄 进行中 / ✅ 完成

---

## 第一阶段：简单（独立、影响范围小）

| # | 类型 | 标题 | 核心改动 | 状态 |
|---|------|------|---------|------|
| 1 | 优化 | 错误边界 + 离线检测 | 新建 `ErrorBoundary` 组件，`App.tsx` 包裹主区域；监听 `navigator.onLine` 禁用 AI 按钮 | ✅ |
| 2 | 优化 | 快照超限策略改进 | `useSnapshots` 增加"重要"标记；超限时提示而非静默删除 | ✅ |
| 3 | 新功 | 场景模板库 | 新建 `SceneTemplates` 组件 + 内置 10 种场景模板数据，一键插入编辑器光标处 | ✅ |
| 4 | 新功 | 专注模式 + 番茄钟 | 新建 `useFocusTimer` hook + `FocusModeOverlay` 组件，沉浸写作 + 计时 | ✅ |

---

## 第二阶段：中等（需跨文件协作或新 API）

| # | 类型 | 标题 | 核心改动 | 状态 |
|---|------|------|---------|------|
| 5 | 优化 | AbortController 取消流 | `gemini.ts` 流式函数接收 `signal`；`useEditor` 在 reject/卸载时 abort | ✅ |
| 6 | 新功 | 对话生成器 | `gemini.ts` 新增 `generateDialogue`；新建 `DialoguePanel` 组件 | ⬜ |
| 7 | 新功 | 段落重写模式 | 复用多版本逻辑；新建 `RewritePanel`，提供 3 种角度重写选区 | ⬜ |
| 8 | 优化 | 快捷键帮助面板 | 新建 `ShortcutHelpPanel`，`?` 键触发；`useKeyboardShortcuts` 增加冲突防护 | ✅ |
| 9 | 新功 | 写作统计仪表盘 | 新建 `useWritingStats` hook（累计字数/日均/AI 接受率）+ `StatsPanel` 组件 | ✅ |
| 10 | 优化 | 设置版本迁移机制 | `settings` 增加 `schemaVersion`；启动时运行 migration 函数补全缺失字段 | ✅ |

---

## 第三阶段：困难（核心逻辑重构或复杂新功能）

| # | 类型 | 标题 | 核心改动 | 状态 |
|---|------|------|---------|------|
| 11 | 优化 | 流式渲染性能 | `useEditor` 用 `useRef` 积累 chunk，`requestAnimationFrame` 批量 flush | ⬜ |
| 12 | 优化 | `useEditor` 冗余 state 清理 | 移除 `pendingContinuationRef` 双轨，改用 ref + `streamVersion` 触发渲染 | ⬜ |
| 13 | 新功 | 章节导出 | 新建 `ExportPanel`；支持导出 `.txt` / `.md` / 全书合并 `.txt` | ✅ |
| 14 | 优化 | Token 预算精准控制 | `memory/storage.ts` 改用基于字节的中文 token 估算；加硬性截断保护 | ⬜ |
| 15 | 优化 | `App.tsx` 拆分 | 提取 `useAppState` hook 承接所有状态编排；`App.tsx` 降到纯渲染层 | ⬜ |

---

## 第四阶段：高难（大型新系统或深度重构）

| # | 类型 | 标题 | 核心改动 | 状态 |
|---|------|------|---------|------|
| 16 | 新功 | 伏笔追踪器 | 编辑器内嵌标注（`<mark>`）+ `useForeshadow` hook + `ForeshadowPanel` 侧边栏 | ⬜ |
| 17 | 新功 | 角色卡片系统 | `useCharacters` hook + `CharacterCard` 数据模型（外貌/性格/关系）+ 管理 UI | ⬜ |
| 18 | 新功 | 跨章节时间轴 | `TimelinePanel` 可视化故事内时间线；AI 辅助提取章节时间节点 | ⬜ |
| 19 | 新功 | 情节漏洞检测 | `gemini.ts` 新增 `detectPlotHoles`（全书分析）+ `PlotHolePanel` 报告界面 | ⬜ |
| 20 | 优化 | IndexedDB 统一抽象 | 提取 `db/repository.ts` Repository 模式；所有 hook 改走类型安全接口 | ⬜ |

---

## 执行原则

- 每项完成后立即跑 `tsc --noEmit -p tsconfig.app.json` 验证无类型错误
- 新组件 CSS 优先复用已有 class（modal-backdrop / modal-panel 等），不新增大块样式
- 不破坏现有功能，每项改动范围最小化
