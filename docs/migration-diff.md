# 迁移差异审计报告
> 生成时间：2026-04-27  
> 执行：Step 1 · 后端目录差异审计

## 核心结论

**后端文件零缺失。** `小说辅助创作-dev/backend/` 已完整包含 PlotPilot 所有 Python 文件，
并额外新增了 3 个文件：
- `application/engine/services/editor_generation_service.py`
- `application/engine/services/chapter_generation_service.py`
- `interfaces/api/v1/engine/editor_routes.py`

**真实差距在前端。** React 前端（`src/`）目前只调用了 9 个后端端点（全部属于 `/api/v1/editor/` 模块），
后端 100+ 个已注册路由处于"实现完毕但未接入"状态。

---

## 已接入的后端端点（前端正在调用）

| 端点 | 前端文件 | 功能 |
|------|---------|------|
| `POST /api/v1/editor/continue-stream` | `src/api/gemini.ts:564` | 流式续写 |
| `POST /api/v1/editor/resume-stream` | `src/api/gemini.ts:650` | 段落续写 |
| `POST /api/v1/editor/outline` | `src/api/gemini.ts:767` | 生成大纲 |
| `POST /api/v1/editor/polish` | `src/api/gemini.ts:802` | 润色 |
| `POST /api/v1/editor/chapter-summary` | `src/api/gemini.ts:1022` | 章节摘要 |
| `POST /api/v1/editor/chapter-extract-all` | `src/api/gemini.ts:1067` | 提取实体+记忆 |
| `POST /api/v1/editor/chapter-extract-entities` | `src/api/gemini.ts:1110` | 仅提取实体 |
| `POST /api/v1/editor/rewrite` | `src/api/gemini.ts:1193` | 改写 |
| `POST /api/v1/editor/explain` | `src/api/gemini.ts:1211` | 解释 |

---

## 未接入的后端模块（待前端集成）

### 优先级 P0（核心数据持久化）
| 模块 | 路由前缀 | 关键端点 |
|------|---------|---------|
| 小说 CRUD | `/api/v1/novels/` | GET/POST/PUT/DELETE |
| 章节 CRUD | `/api/v1/novels/{id}/chapters/` | GET/POST/PUT/DELETE |

### 优先级 P1（用户可感知功能）
| 模块 | 路由前缀 | 关键能力 |
|------|---------|---------|
| 自动驾驶 | `/api/v1/autopilot/{novel_id}/` | start/stop/status/stream |
| 文风分析 | `/api/v1/novels/{id}/voice/` | fingerprint/drift/samples |
| 伏笔台账 | `/api/v1/novels/{id}/foreshadow-ledger/` | CRUD + match |
| 节拍表 | `/api/v1/beat-sheets/` | generate/get/delete |
| 章节审查 | `/api/v1/chapter-reviews/` | POST（生成审查报告） |

### 优先级 P2（世界观/图谱）
| 模块 | 路由前缀 | 关键能力 |
|------|---------|---------|
| 人物/地点/世界观 | `/api/v1/bible/novels/{id}/` | CRUD + generate |
| 知识图谱 | `/api/v1/knowledge/` | triples + graph |
| 角色关系图 | `/api/v1/cast/` | relationships |

### 优先级 P3（高级功能）
| 模块 | 路由前缀 | 关键能力 |
|------|---------|---------|
| 宏观重构 | `/api/v1/macro-refactor/` | diagnose + propose |
| 叙事状态机 | `/api/v1/novels/{id}/narrative-state/` | extract + update |
| 故事结构 | `/api/v1/story-structure/` | plan |
| 快照历史 | `/api/v1/snapshots/` | create/list/restore |
| 监控日志 | `/api/v1/monitor/` | SSE 日志流 |

---

## 修订后的执行策略

原计划（步骤 1-48）假设需要编写后端代码。实际情况：

> **后端已完成，全部 55 步改为前端集成工作。**

| 原计划 Phase | 修订后工作 | 优先级 |
|-------------|----------|--------|
| Phase 1-2: 基础设施 | 验证后端健康启动 + 环境配置 | P0 |
| Phase 3-4: CRUD API | 前端小说/章节列表接入后端 | P0 |
| Phase 5: 知识图谱 | 前端 GraphPanel 接入后端 knowledge API | P1 |
| Phase 6: 节拍 | 前端 BeatsPanel 接入 beat-sheets API | P1 |
| Phase 7: 分析 | 前端接入 voice/foreshadow API | P1 |
| Phase 8: 审查 | 前端新增 AuditPanel | P2 |
| Phase 9: 自动驾驶 | 前端新增 AutopilotPanel | P1 |
| Phase 10: 测试部署 | E2E 测试 + Docker | P2 |

---

## 下一步（Step 2）

验证后端可以在 `小说辅助创作-dev/` 目录下正常启动并响应健康检查。
