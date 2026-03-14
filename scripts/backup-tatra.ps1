$ErrorActionPreference = 'Stop'

$sourcePath = 'C:\Users\Y PC\Desktop\Tatra'
$backupRoot = 'C:\Users\Y PC\Desktop\auto backuptatra'
$desktopPath = 'C:\Users\Y PC\Desktop'
$maxBackupBytes = 20GB
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$destinationPath = Join-Path $backupRoot $timestamp
$stateBackupPath = Join-Path $destinationPath 'state-json'
$browserBackupPath = Join-Path $destinationPath 'browser-storage'

$browserStorageSources = @(
  @{
    Name = 'chrome-default-local-storage'
    Path = 'C:\Users\Y PC\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb'
  },
  @{
    Name = 'edge-default-local-storage'
    Path = 'C:\Users\Y PC\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb'
  }
)

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
New-Item -ItemType Directory -Force -Path $stateBackupPath | Out-Null
New-Item -ItemType Directory -Force -Path $browserBackupPath | Out-Null

$null = robocopy $sourcePath $destinationPath /E /R:1 /W:1 /XD ".git" "node_modules" /XF "*.tmp" "*.log"

if ($LASTEXITCODE -gt 7) {
  throw "Backup failed with robocopy exit code $LASTEXITCODE."
}

Get-ChildItem -LiteralPath $desktopPath -Filter 'tatra-state-*.json' -File -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stateBackupPath $_.Name) -Force
}

foreach ($storageSource in $browserStorageSources) {
  if (-not (Test-Path $storageSource.Path)) {
    continue
  }

  $browserDestination = Join-Path $browserBackupPath $storageSource.Name
  New-Item -ItemType Directory -Force -Path $browserDestination | Out-Null

  $null = robocopy $storageSource.Path $browserDestination /E /R:1 /W:1
  if ($LASTEXITCODE -gt 7) {
    throw "Browser storage backup failed for $($storageSource.Name) with robocopy exit code $LASTEXITCODE."
  }
}

function Get-DirectorySizeBytes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return [int64]0
  }

  $measure = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
  if ($null -eq $measure.Sum) {
    return [int64]0
  }

  return [int64]$measure.Sum
}

function Remove-OldBackupsIfNeeded {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,
    [Parameter(Mandatory = $true)]
    [int64]$MaxBytes,
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

$remainingBytes = Remove-OldBackupsIfNeeded -RootPath $backupRoot -MaxBytes $maxBackupBytes -NewestBackupPath $destinationPath

Write-Output "Backup created at $destinationPath"
Write-Output ("Backup root size is now {0:N2} GB" -f ($remainingBytes / 1GB))
