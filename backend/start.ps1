#Requires -Version 5.1

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$BackendDir = $PSScriptRoot
$Port = 8005

function Write-Step { param([string]$Message) Write-Host "`n▶ $Message" -ForegroundColor Cyan }
function Write-OK { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "⚠ $Message" -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host "✗ $Message" -ForegroundColor Red }

function Resolve-Python {
    $candidates = @(
        (Join-Path $BackendDir ".venv\Scripts\python.exe"),
        (Join-Path (Split-Path $BackendDir -Parent) ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    return $null
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   小说辅助创作 Backend Launcher" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

$pythonExe = Resolve-Python
if (-not $pythonExe) {
    Write-Fail "未找到 Python，请先安装 Python 3.10+ 或在 backend/.venv 中创建虚拟环境。"
    exit 1
}

Write-OK "Python: $pythonExe"

if (-not (Test-Path (Join-Path $BackendDir ".env")) -and (Test-Path (Join-Path $BackendDir ".env.example"))) {
    Copy-Item (Join-Path $BackendDir ".env.example") (Join-Path $BackendDir ".env")
    Write-Warn "backend/.env 不存在，已从 .env.example 复制，请按需补充密钥。"
}

Write-Step "检查 FastAPI 依赖"
& $pythonExe -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "缺少后端依赖，请先执行: pip install -r backend/requirements.txt"
    exit 1
}
Write-OK "FastAPI / uvicorn 可用"

Write-Step "启动后端服务"
Set-Location $BackendDir
& $pythonExe -m uvicorn interfaces.main:app --host 127.0.0.1 --port $Port --reload
