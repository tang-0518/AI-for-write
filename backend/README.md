# PlotPilot 后端迁入说明

当前目录是从 `C:\Users\Administrator\Desktop\开发\PlotPilot` 迁入的 Python 后端骨架，保留了 PlotPilot 的 DDD 分层与 FastAPI 接口结构，作为本项目后续服务化改造的基础。

## 已迁入内容

- `application/`：应用服务、工作流、编排逻辑
- `domain/`：领域实体、值对象、仓储接口
- `infrastructure/`：SQLite、向量库、LLM Provider、Prompt 基础设施
- `interfaces/`：FastAPI 入口与 REST API 路由
- `scripts/`：迁移、守护进程、模型下载与诊断脚本
- `tests/`：原后端测试目录

## 快速启动

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
# 如需向量检索，可先执行 docker compose up -d
.venv\Scripts\python -m uvicorn interfaces.main:app --host 127.0.0.1 --port 8005 --reload
```

启动后访问：

- API: `http://127.0.0.1:8005`
- Docs: `http://127.0.0.1:8005/docs`
- Health: `http://127.0.0.1:8005/health`

## 当前仓库里的定位

- 现有 React 前端暂时仍以本地 IndexedDB + `mcp-server/` 为主
- `backend/` 已完整并仓，可单独运行、调试和继续对接前端
- 根目录 `dev-start.ps1` 已增加对该后端的可选启动支持
