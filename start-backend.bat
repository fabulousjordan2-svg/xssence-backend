@echo off
setlocal
set "PATH=%ProgramFiles%;%PATH%"
cd /d "%~dp0"
call npm.cmd start
