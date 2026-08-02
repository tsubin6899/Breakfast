@echo off
setlocal
cd /d "%~dp0"

set "BREAKFAST_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%BREAKFAST_NODE%" set "BREAKFAST_NODE=node.exe"

"%BREAKFAST_NODE%" "%~dp0scripts\local-server.mjs"

echo.
echo The local system has stopped. Press any key to close this window.
pause >nul
endlocal
