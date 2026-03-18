param(
  [string]$ServiceUrl = 'https://tatra-eu.onrender.com',
  [string]$BackupRoot = 'C:\Users\Y PC\Desktop\online-db-backup-tatra',
  [string]$Token = '',
  [Int64]$MaxBackupBytes = 21474836480
)

$ErrorActionPreference = 'Stop'

if (-not $Token) {
  $Token = [Environment]::GetEnvironmentVariable('TATRA_BACKUP_TOKEN', 'User')
}

if (-not $Token) {
  throw 'Missing backup token. Set TATRA_BACKUP_TOKEN in your user environment or pass -Token.'
}

$normalizedServiceUrl = $ServiceUrl.TrimEnd('/')
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$destinationFolder = Join-Path $BackupRoot $timestamp
$destinationPath = Join-Path $destinationFolder 'tatra-online.sqlite'
$downloadUrl = "$normalizedServiceUrl/api/db/backup-download"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $destinationFolder | Out-Null

$headers = @{
  'x-tatra-backup-token' = $Token
}

Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $destinationPath -UseBasicParsing

if (-not (Test-Path $destinationPath)) {
  throw 'Online database backup file was not downloaded.'
}

function Get-DirectorySizeBytes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return [Int64]0
  }

  $measure = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
  if ($null -eq $measure.Sum) {
    return [Int64]0
  }

  return [Int64]$measure.Sum
}

function Remove-OldBackupsIfNeeded {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,
    [Parameter(Mandatory = $true)]
    [Int64]$MaxBytes,
    [Parameter(Mandatory = $true)]
    [string]$NewestBackupPath
  )

  $backupDirectories = Get-ChildItem -LiteralPath $RootPath -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime
  $totalBytes = Get-DirectorySizeBytes -Path $RootPath

  while ($totalBytes -gt $MaxBytes -and $backupDirectories.Count -gt 1) {
    $oldestDirectory = $backupDirectories |
      Where-Object { $_.FullName -ne $NewestBackupPath } |
      Select-Object -First 1

    if (-not $oldestDirectory) {
      break
    }

    Remove-Item -LiteralPath $oldestDirectory.FullName -Recurse -Force
    $backupDirectories = Get-ChildItem -LiteralPath $RootPath -Directory -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime
    $totalBytes = Get-DirectorySizeBytes -Path $RootPath
  }

  return $totalBytes
}

$remainingBytes = Remove-OldBackupsIfNeeded -RootPath $BackupRoot -MaxBytes $MaxBackupBytes -NewestBackupPath $destinationFolder

Write-Output "Online DB backup created at $destinationPath"
Write-Output ("Backup root size is now {0:N2} GB" -f ($remainingBytes / 1GB))
