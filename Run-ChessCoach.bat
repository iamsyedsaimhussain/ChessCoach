@echo off
setlocal
title ChessCoach ^| Personal AI Coach
mode con: cols=85 lines=30
color 0F

:START
cls
echo.
echo  ===================================================================================
echo     ____ _                     ____                  _     
echo    / ___^| ^|__   ___  ___ ___  / ___^|___   __ _  ___^| ^|__  
echo   ^| ^|   ^| '_ \ / _ \/ __/ __^|^| ^|   / _ \ / _` ^|/ __^| '_ \ 
echo   ^| ^|___^| ^| ^| ^|  __/\__ \__ \^| ^|__^| (_) ^| (_^| ^| (__^| ^| ^| ^|
echo    \____^|_^| ^|_^|\___^|^|___/___/ \____\___/ \__,_^|\___^|_^| ^|_^|
echo.
echo  ===================================================================================
echo.
echo    [STATUS] Checking Node.js Environment...

:: Check Node
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo    [!] FATAL ERROR: Node.js is not installed on this system.
    echo    Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b
)

cd /d "%~dp0"

:: Check for missing node_modules
if not exist "node_modules\" (
    color 0E
    echo    [STATUS] Dependencies not found. Installing packages...
    echo    -------------------------------------------------------------------------------
    call npm install
    echo    -------------------------------------------------------------------------------
    echo    [SUCCESS] Packages installed successfully.
    color 0F
)

echo    [STATUS] Launching ChessCoach Client Engine...
echo    [STATUS] Local URL: http://localhost:5173
echo.
echo    -------------------------------------------------------------------------------
echo     CHESSCOACH IS ACTIVE. KEEP THIS WINDOW OPEN WHILE USING THE APP.
echo    -------------------------------------------------------------------------------
echo.

call npm run dev -- --open

echo.
echo    [SYSTEM] ChessCoach has closed.
echo    [?] Press any key to RESTART or close this window.
pause >nul
goto START
