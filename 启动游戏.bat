@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo AI-7 游戏服务器启动中…… 浏览器会自动打开 http://127.0.0.1:8787
start "" http://127.0.0.1:8787
node server.js
pause
