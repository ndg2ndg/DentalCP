@echo off
cd /d I:\Dev\DentalCP
echo ================================
echo  DCP Website - GitHub Update Tool
echo ================================
echo.

:: Check we're in the right place
if not exist webchat_widget.html (
    echo ERROR: webchat_widget.html not found in I:\Dev\DentalCP
    pause
    exit /b 1
)

:: Get commit message from user
set /p MSG="Enter update description (or press Enter for auto): "
if "%MSG%"==***REMOVED***set MSG=Auto update %date% %time%

:: Stage and commit
git add .
git commit -m "%MSG%"

:: Sync with remote before pushing
echo.
echo Syncing with GitHub...
git pull origin main --rebase

:: Push
echo.
echo Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Push failed. Please contact IT support.
    pause
    exit /b 1
)

echo.
echo ================================
echo  Done! GitHub updated.
echo ================================
pause
