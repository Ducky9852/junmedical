$ServerIP = "64.110.106.131"
$ServerUser = "ubuntu"
$RemoteDir = "/home/ubuntu/bot"
$ServiceName = "salesbot"

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $CurrentDir) {
    $CurrentDir = (Get-Location).Path
}

$KeyCandidates = @(
    (Join-Path $CurrentDir "ssh-key-2026-07-06.key"),
    "C:\Users\Ducky98\Claude\Projects\ssh-key-2026-07-06.key",
    "c:\Users\Ducky98\Desktop\AntiGravity\ssh-key-2026-07-06.key",
    "c:\Users\Ducky98\Downloads\ssh-key-2026-07-06.key",
    "$env:USERPROFILE\.ssh\id_rsa"
)

$SshKey = $null
foreach ($k in $KeyCandidates) {
    if (Test-Path $k) {
        $SshKey = $k
        break
    }
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " [MEDI-SALES 360] Ubuntu Server Auto Deploy" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Target Server: $ServerUser@$ServerIP"
if ($SshKey) {
    Write-Host "SSH Key Found: $SshKey" -ForegroundColor Green
} else {
    Write-Host "SSH Key: Not found in candidate paths. Using default ssh agent." -ForegroundColor Yellow
}

$DeployFiles = @(
    "sales_log.py",
    "app.py",
    "erp_products.json",
    "index.html",
    "app.css",
    "app.js",
    "sales_database.js",
    "sales_database.json"
)

Write-Host "`n[1/2] Uploading updated files to Ubuntu server..." -ForegroundColor Yellow
$KeyOption = if ($SshKey) { "-i `"$SshKey`"" } else { "" }

foreach ($fileName in $DeployFiles) {
    $fullPath = Join-Path $CurrentDir $fileName
    if (Test-Path $fullPath) {
        Write-Host "  - Uploading: $fileName ..." -NoNewline
        $scpCmd = "scp $KeyOption `"$fullPath`" ${ServerUser}@${ServerIP}:${RemoteDir}/"
        Invoke-Expression $scpCmd | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " [SUCCESS]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED: ExitCode $LASTEXITCODE]" -ForegroundColor Red
        }
    } else {
        Write-Host "  - Skipped (Not found): $fileName" -ForegroundColor DarkGray
    }
}

Write-Host "`n[2/2] Restarting $ServiceName service on Ubuntu server..." -ForegroundColor Yellow
$sshCmd = "ssh $KeyOption ${ServerUser}@${ServerIP} `"sudo systemctl restart $ServiceName; sudo systemctl status $ServiceName --no-pager`""
Invoke-Expression $sshCmd

Write-Host "`n=====================================================" -ForegroundColor Cyan
Write-Host " [DONE] Deployment Finished! Check http://${ServerIP}:8080" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
