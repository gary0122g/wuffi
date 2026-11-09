@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or later, then run this file again.
  pause
  exit /b 1
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo Install Rust and Visual Studio C++ Build Tools first. See README.
  pause
  exit /b 1
)
if not exist "node_modules\typescript" (
  call npm ci --ignore-scripts
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run dev
if errorlevel 1 pause
