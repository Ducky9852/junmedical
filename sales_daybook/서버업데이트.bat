@echo off
cd /d "C:\Users\Ducky98\Desktop\AntiGravity"
echo =====================================================================
echo    MEDI-SALES 360 Ubuntu Server Auto Deploy
echo =====================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ducky98\Desktop\AntiGravity\update_bot.ps1"
echo.
pause
