
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('c:\Users\Ducky98\Desktop\준메디칼_서버업데이트.lnk')
$Shortcut.TargetPath = 'powershell.exe'
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "c:\Users\Ducky98\Desktop\AntiGravity\update_bot.ps1"'
$Shortcut.WorkingDirectory = 'c:\Users\Ducky98\Desktop\AntiGravity'
$Shortcut.IconLocation = 'shell32.dll,43'
$Shortcut.Description = '준메디칼 우분투 서버 원클릭 자동 배포'
$Shortcut.Save()
