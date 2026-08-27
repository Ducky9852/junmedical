import os
import subprocess

current_dir = r"c:\Users\Ducky98\Desktop\AntiGravity"
desktop_dir = r"c:\Users\Ducky98\Desktop"

ps_script = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('{desktop_dir}\\준메디칼_서버업데이트.lnk')
$Shortcut.TargetPath = 'powershell.exe'
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "{current_dir}\\update_bot.ps1"'
$Shortcut.WorkingDirectory = '{current_dir}'
$Shortcut.IconLocation = 'shell32.dll,43'
$Shortcut.Description = '준메디칼 우분투 서버 원클릭 자동 배포'
$Shortcut.Save()
"""

with open('make_shortcut.ps1', 'w', encoding='utf-8') as f:
    f.write(ps_script)

subprocess.run(["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", "make_shortcut.ps1"], check=True)
print("Desktop .lnk shortcut created successfully!")
