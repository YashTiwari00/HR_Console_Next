$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$escapedRepo = [regex]::Escape($repoRoot)

Write-Host "[dev:stable] Repo:" $repoRoot

# Find stale Next dev node processes for this repository only.
$stale = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $cmd = [string]$_.CommandLine
    $cmd -match "next\s+dev" -and $cmd -match $escapedRepo
  }

if ($stale -and $stale.Count -gt 0) {
  $ids = $stale | Select-Object -ExpandProperty ProcessId
  Write-Host "[dev:stable] Stopping stale process ids:" ($ids -join ", ")
  $ids | ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 400
} else {
  Write-Host "[dev:stable] No stale next dev processes found."
}

$lockFile = Join-Path $repoRoot ".next\dev\lock"
if (Test-Path $lockFile) {
  Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
  Write-Host "[dev:stable] Removed stale lock:" $lockFile
}

Write-Host "[dev:stable] Starting Next.js dev server..."
npm run dev
