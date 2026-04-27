#Requires -Version 5.1
# =============================================================
# dev-start.ps1 — 小说辅助创作 全流程一键启动
#
# 启动顺序：
#   1. 检查环境（Node、API Key）
#   2. 安装依赖（如需）
#   3. 启动 MCP 服务器（含知识图谱 API，端口 3001）
#   4. 等待 API 就绪
#   5. 启动 Python 后端（可选，端口 8005）
#   6. 启动前端 Vite 开发服务器（端口 5174）
#   7. 等待前端就绪
#   8. 打开浏览器
# =============================================================

# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT          = $PSScriptRoot
$MCP_DIR       = Join-Path $ROOT "mcp-server"
$BACKEND_DIR   = Join-Path $ROOT "backend"
$FRONTEND_PORT = 5174
$API_PORT      = 3001
$BACKEND_PORT  = 8005
$BROWSER_URL   = "http://localhost:$FRONTEND_PORT"

# ── 颜色输出辅助 ───────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n  ▶ $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  ✓ $msg"  -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠ $msg"  -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✗ $msg"  -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "    $msg"  -ForegroundColor DarkGray }

function Resolve-BackendPython {
    $candidates = @(
        (Join-Path $BACKEND_DIR ".venv\Scripts\python.exe"),
        (Join-Path $ROOT ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return $pythonCmd.Source
    }

    return $null
}

# ── 横幅 ──────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ╭══════════════════════════════════════════╮" -ForegroundColor Magenta
Write-Host "  ║       小说辅助创作  —  开发环境启动       ║" -ForegroundColor Magenta
Write-Host "  ╰══════════════════════════════════════════╯" -ForegroundColor Magenta
Write-Host ""

# ── 1. 检查 Node.js ───────────────────────────────────────
Write-Step "检查运行环境"
try {
    $nodeVer = & node --version 2>&1
    $npmVer  = & npm  --version 2>&1
    Write-OK "Node.js $nodeVer  /  npm $npmVer"
} catch {
    Write-Fail "未找到 Node.js，请先安装 Node.js 18+"
    Read-Host "按 Enter 退出"
    exit 1
}

# ── 2. 检查 .env / API Key ─────────────────────────────
Write-Step "检查 MCP 服务器配置"
$envFile = Join-Path $MCP_DIR ".env"
if (-not (Test-Path $envFile)) {
    $envExample = Join-Path $MCP_DIR ".env.example"
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Warn ".env 不存在，已从 .env.example 复制"
    } else {
        Write-Fail "未找到 $envFile，请先创建并填入 GEMINI_API_KEY"
        Read-Host "按 Enter 退出"
        exit 1
    }
}

$envContent = Get-Content $envFile -Raw
$keyOK = $envContent -match "GEMINI_API_KEY=\S+" -and
         -not ($envContent -match "GEMINI_API_KEY=你的-gemini-api-key")
if (-not $keyOK) {
    Write-Fail "请先在 mcp-server/.env 中填入真实的 GEMINI_API_KEY"
    Write-Info "文件路径: $envFile"
    $openFile = Read-Host "  是否现在打开文件编辑？(y/N)"
    if ($openFile -eq "y" -or $openFile -eq "Y") {
        Start-Process notepad $envFile
    }
    Read-Host "填写完成后按 Enter 继续"
    $envContent = Get-Content $envFile -Raw
    $keyOK = $envContent -match "GEMINI_API_KEY=\S+" -and
             -not ($envContent -match "GEMINI_API_KEY=你的-gemini-api-key")
    if (-not $keyOK) {
        Write-Fail "GEMINI_API_KEY 仍未填写，退出"
        exit 1
    }
}
Write-OK "Gemini API Key 已配置"

# ── 3. 安装依赖 ─────────────────────────────────────────
Write-Step "检查依赖"

$mcpModules      = Join-Path $MCP_DIR "node_modules"
$frontendModules = Join-Path $ROOT     "node_modules"
$backendExists   = Test-Path (Join-Path $BACKEND_DIR "interfaces\main.py")
$backendPython   = $null
$backendCanStart = $false
$backendReady    = $false

if (-not (Test-Path $mcpModules)) {
    Write-Info "MCP 服务器首次安装依赖..."
    Push-Location $MCP_DIR
    & npm install --silent
    Pop-Location
    Write-OK "MCP 依赖已安装"
} else {
    Write-OK "MCP 依赖已存在"
}

if (-not (Test-Path $frontendModules)) {
    Write-Info "前端首次安装依赖..."
    Push-Location $ROOT
    & npm install --silent
    Pop-Location
    Write-OK "前端依赖已安装"
} else {
    Write-OK "前端依赖已存在"
}

if ($backendExists) {
    Write-Step "检查 Python 后端"

    $backendPython = Resolve-BackendPython
    if (-not $backendPython) {
        Write-Warn "检测到 backend/，但未找到可用 Python；后端启动将跳过"
    } else {
        $pythonCandidates = @($backendPython)
        $systemPython = Get-Command python -ErrorAction SilentlyContinue
        if ($systemPython -and $systemPython.Source -notin $pythonCandidates) {
            $pythonCandidates += $systemPython.Source
        }

        $backendDependencyReady = $false
        foreach ($candidate in $pythonCandidates) {
            & $candidate -c "import fastapi, uvicorn" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $backendPython = $candidate
                $backendDependencyReady = $true
                break
            }
        }

        Write-OK "Python 可用：$backendPython"

        $backendEnv = Join-Path $BACKEND_DIR ".env"
        $backendEnvExample = Join-Path $BACKEND_DIR ".env.example"
        if (-not (Test-Path $backendEnv) -and (Test-Path $backendEnvExample)) {
            Copy-Item $backendEnvExample $backendEnv
            Write-Warn "backend/.env 不存在，已从 .env.example 复制"
        }

        if ($backendDependencyReady) {
            $backendCanStart = $true
            Write-OK "FastAPI / uvicorn 依赖已满足"
        } else {
            Write-Warn "后端依赖未安装，可执行：pip install -r backend/requirements.txt"
        }
    }
}

# ── 4. 清理旧进程 ──────────────────────────────────────
function Stop-PortProcess {
    param([int]$Port)
    $pids = netstat -ano 2>$null |
        Select-String ":$Port\s" |
        ForEach-Object { ($_ -split "\s+")[-1] } |
        Where-Object { $_ -match "^\d+$" } |
        Sort-Object -Unique
    foreach ($p in $pids) {
        try {
            Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue
        } catch {}
    }
}

Write-Step "清理旧进程"
Stop-PortProcess $API_PORT
Stop-PortProcess $FRONTEND_PORT
if ($backendExists) {
    Stop-PortProcess $BACKEND_PORT
}
Start-Sleep -Milliseconds 500
Write-OK "端口 $API_PORT、$FRONTEND_PORT$(if ($backendExists) { "、$BACKEND_PORT" }) 已释放"

# ── 5. 启动 MCP 服务器 ───────────────────────────────────
# 修复：用 -WorkingDirectory 替代 -Command 内的 Set-Location
#         避免中文路径在命令行参数中乱码
Write-Step "启动 MCP 服务器 + 知识图谱 API (端口 $API_PORT)"

$mcpCmd = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; `$host.UI.RawUI.WindowTitle='MCP Server'; Write-Host '  [MCP] 启动中...' -ForegroundColor Cyan; npm run dev"
$mcpWindow = Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", $mcpCmd `
    -WorkingDirectory $MCP_DIR `
    -PassThru -WindowStyle Normal

Write-Info "MCP 窗口 PID: $($mcpWindow.Id)"

# ── 6. 等待 API 就绪 ─────────────────────────────────────
Write-Step "等待 MCP API 就绪"

$maxWait = 60
$elapsed = 0
$dots    = ""
$ready   = $false

while ($elapsed -lt $maxWait) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$API_PORT/api/health" `
            -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    $dots += "."
    Write-Host "`r    等待中$dots " -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 1000
    $elapsed += 1
}

Write-Host ""
if (-not $ready) {
    Write-Fail "MCP 服务器启动超时（${maxWait}s）"
    Write-Info  "请检查 MCP 窗口中的错误信息"
    Read-Host "按 Enter 退出"
    exit 1
}
Write-OK "MCP API 已就绪 → http://127.0.0.1:$API_PORT/api"

# ── 7. 启动 Python 后端（可选） ───────────────────────────
if ($backendExists -and $backendCanStart) {
    Write-Step "启动 PlotPilot 风格 Python 后端 (端口 $BACKEND_PORT)"

    $backendCmd = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; `$host.UI.RawUI.WindowTitle='PlotPilot Backend'; Write-Host '  [Backend] 启动中...' -ForegroundColor Cyan; & '$backendPython' -m uvicorn interfaces.main:app --host 127.0.0.1 --port $BACKEND_PORT"
    $backendWindow = Start-Process powershell `
        -ArgumentList "-NoExit", "-Command", $backendCmd `
        -WorkingDirectory $BACKEND_DIR `
        -PassThru -WindowStyle Normal

    Write-Info "Backend 窗口 PID: $($backendWindow.Id)"
    Write-Step "等待 Python 后端就绪"

    $elapsed = 0
    $dots    = ""
    while ($elapsed -lt $maxWait) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$BACKEND_PORT/health" `
                -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $backendReady = $true; break }
        } catch {}
        $dots += "."
        Write-Host "`r    等待中$dots " -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Milliseconds 1000
        $elapsed += 1
    }

    Write-Host ""
    if ($backendReady) {
        Write-OK "Python 后端已就绪 → http://127.0.0.1:$BACKEND_PORT"
    } else {
        Write-Warn "Python 后端未在 ${maxWait}s 内完成启动，请检查 Backend 窗口日志"
    }
} elseif ($backendExists) {
    Write-Step "跳过 Python 后端启动"
    Write-Warn "backend/ 已存在，但当前环境未满足启动条件"
}

# ── 8. 启动前端 ──────────────────────────────────────────
Write-Step "启动前端 Vite 开发服务器 (端口 $FRONTEND_PORT)"

$feCmd = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; `$host.UI.RawUI.WindowTitle='Frontend'; Write-Host '  [Frontend] 启动中...' -ForegroundColor Cyan; npm run dev -- --port $FRONTEND_PORT"
$frontendWindow = Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", $feCmd `
    -WorkingDirectory $ROOT `
    -PassThru -WindowStyle Normal

Write-Info "前端窗口 PID: $($frontendWindow.Id)"

# ── 9. 等待前端就绪 ────────────────────────────────────
Write-Step "等待前端就绪"

$elapsed = 0
$dots    = ""
$ready   = $false

while ($elapsed -lt $maxWait) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $FRONTEND_PORT)
        $tcp.Close()
        $ready = $true; break
    } catch {}
    $dots += "."
    Write-Host "`r    等待中$dots " -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 800
    $elapsed += 1
}

Write-Host ""
if (-not $ready) {
    Write-Fail "前端服务器启动超时（${maxWait}s）"
    Write-Info  "请检查前端窗口中的错误信息"
    Read-Host "按 Enter 退出"
    exit 1
}
Write-OK "前端已就绪 → $BROWSER_URL"

# ── 10. 打开浏览器 ───────────────────────────────────────
Start-Sleep -Milliseconds 800
Write-Step "打开浏览器"
Start-Process $BROWSER_URL
Write-OK "已打开 $BROWSER_URL"

# ── 完成 ───────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╭══════════════════════════════════════════╮" -ForegroundColor Green
Write-Host "  ║           ✅  所有服务已启动              ║" -ForegroundColor Green
Write-Host "  ╟══════════════════════════════════════════╢" -ForegroundColor Green
Write-Host "  ║  前端       http://localhost:$FRONTEND_PORT      ║" -ForegroundColor Green
Write-Host "  ║  图谱 API   http://localhost:$API_PORT/api   ║" -ForegroundColor Green
if ($backendExists) {
    $backendSummary = if ($backendReady) { "http://localhost:$BACKEND_PORT" } else { "未就绪，见 Backend 窗口" }
    Write-Host ("  ║  Python后端 {0,-28}║" -f $backendSummary) -ForegroundColor Green
}
Write-Host "  ╰══════════════════════════════════════════╯" -ForegroundColor Green
Write-Host ""
Write-Host "  关闭此窗口不会停止服务，直接关闭对应子窗口即可。" -ForegroundColor DarkGray
Write-Host ""
Read-Host "按 Enter 关闭此启动窗口"
