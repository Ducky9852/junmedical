import os
import shutil

current_dir = os.path.abspath(".")
desktop_dir = os.path.join(os.environ["USERPROFILE"], "Desktop")

# Clean standard batch file content (ANSI encoding)
bat_content = f"""@echo off
cd /d "{current_dir}"
echo =====================================================================
echo    MEDI-SALES 360 Ubuntu Server Auto Deploy
echo =====================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{current_dir}\\update_bot.ps1"
echo.
pause
"""

bat_path_local = os.path.join(current_dir, "서버업데이트.bat")
bat_path_desktop = os.path.join(desktop_dir, "준메디칼_서버업데이트.bat")

with open(bat_path_local, "w", encoding="cp949") as f:
    f.write(bat_content)

with open(bat_path_desktop, "w", encoding="cp949") as f:
    f.write(bat_content)

print("Batch files successfully written in CP949 (Windows ANSI)!")
