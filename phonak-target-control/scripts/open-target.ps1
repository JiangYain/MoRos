param(
  [string]$TargetPath = "C:\Program Files (x86)\Phonak\Phonak Target [Internal] 12.0.0.3627 (Alpha 0) master (2)\Target.exe",
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $TargetPath)) {
  throw "Target.exe not found: $TargetPath"
}

function Get-TargetMainWindow {
  Get-Process -Name Target -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -match "Phonak Target 12\.0"
    } |
    Select-Object -First 1
}

$targetProcess = Get-TargetMainWindow
if (-not $targetProcess) {
  [void](Start-Process -FilePath $TargetPath -PassThru)
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Milliseconds 500
  $targetProcess = Get-TargetMainWindow
} until ($targetProcess -or (Get-Date) -ge $deadline)

if (-not $targetProcess) {
  $runningTargets = Get-Process -Name Target -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, MainWindowTitle, Path

  $runningText = if ($runningTargets) {
    ($runningTargets | Format-List | Out-String).Trim()
  } else {
    "No Target process is running."
  }

  throw "Timed out waiting for main window title 'Phonak Target 12.0'. Running Target processes:`n$runningText"
}

[pscustomobject]@{
  Status = "Ready"
  Id = $targetProcess.Id
  ProcessName = $targetProcess.ProcessName
  MainWindowTitle = $targetProcess.MainWindowTitle
  Path = $targetProcess.Path
} | Format-List
