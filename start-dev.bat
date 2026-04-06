@echo off
chcp 65001 >nul
title 小说辅助创作-dev - 开发模式 (端口 5174)

cd /d "%~dp0"

echo 正在启动开发服务器 (http://localhost:5174)...

:: 后台等待服务器就绪后打开浏览器
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5174"

npm run dev -- --port 5174
