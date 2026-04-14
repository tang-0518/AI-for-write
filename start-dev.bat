@echo off
chcp 65001 >nul
title 小说辅助创作 — 启动中...

:: 用 PowerShell 执行启动脚本（绕过执行策略限制）
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0dev-start.ps1"

:: 如果 PS1 意外退出，暂停显示错误
if %errorlevel% neq 0 (
    echo.
    echo  启动脚本异常退出，错误代码：%errorlevel%
    pause
)
