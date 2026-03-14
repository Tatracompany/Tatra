$ErrorActionPreference = 'Stop'

$launcherRoot = 'C:\TatraTasks'
$launcherPath = Join-Path $launcherRoot 'run-online-backup.cmd'
$targetScriptPath = 'C:\Users\Y PC\Desktop\Tatra\scripts\backup-online-db.ps1'

New-Item -ItemType Directory -Force -Path $launcherRoot | Out-Null
Set-Content -LiteralPath $launcherPath -Encoding ASCII -Value @(
  '@echo off'
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Y PC\Desktop\Tatra\scripts\backup-online-db.ps1"'
)

Write-Output $launcherPath
