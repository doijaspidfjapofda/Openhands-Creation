@echo off
setlocal
cd /d "%~dp0"
title 纸间 PDF 本机工具

where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Node.js not found. Starting a local preview with Python on port 5174.
  start "" "http://127.0.0.1:5174/index.html"
  python -m http.server 5174 --bind 127.0.0.1
  goto :end
)

echo Node.js and Python were not found.
echo Install Node.js, then double-click this file again.
echo.
pause

:end
endlocal
