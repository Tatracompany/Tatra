param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$ServiceUrl = 'https://tatra.onrender.com',
  [string]$Token = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

if (-not $Token) {
  $Token = [Environment]::GetEnvironmentVariable('TATRA_BACKUP_TOKEN', 'User')
}

if (-not $Token) {
  throw 'Missing backup token. Set TATRA_BACKUP_TOKEN in your user environment or pass -Token.'
}

$normalizedServiceUrl = $ServiceUrl.TrimEnd('/')
$restoreUrl = "$normalizedServiceUrl/api/db/backup-restore"
$headers = @{
  'x-tatra-backup-token' = $Token
  'Content-Type' = 'application/octet-stream'
}

Invoke-WebRequest -Uri $restoreUrl -Method Post -Headers $headers -InFile $BackupFile -UseBasicParsing | Out-Null

Write-Output "Online DB restored from $BackupFile"
