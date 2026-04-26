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
:: Stage ALL files, commit and push
git add .
git commit -m "%MSG%"
git push origin main 2>nul || git push origin master:main
echo.
echo ================================
echo  Done! GitHub updated.
echo ================================
pause
