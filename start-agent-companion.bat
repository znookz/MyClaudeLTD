@echo off
rem Start Agent Companion (bridge ws://localhost:8080 + web http://localhost:5173) in one go.
rem Usage: double-click, or run:  start-agent-companion.bat [nobrowser]
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem Already running? (Vite listens on 5173) -> reuse it, do not start a second copy.
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo Agent Companion is already running on http://localhost:5173
  if /i not "%~1"=="nobrowser" start "" http://localhost:5173
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH. Install Node 18+ first.
  pause
  exit /b 1
)

if not exist agent-companion\node_modules (
  echo First run: installing packages...
  call npm --prefix agent-companion install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

rem Open the browser a few seconds after the server comes up.
if /i not "%~1"=="nobrowser" start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173"

echo Starting bridge + web app. Close this window or press Ctrl+C to stop.
call npm --prefix agent-companion start
