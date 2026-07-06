param(
  [string]$PalioStudioPath = "C:\Program Files (x86)\Phonak\Phonak Target [Internal] 12.0.0.3627 (Alpha 0) master (2)\PalioStudio.exe",
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetPalioWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function Get-PalioWindowProcess {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -eq "Palio Studio"
    } |
    Select-Object -First 1
}

function Bring-WindowToFront {
  param($Process)

  if ($Process -and $Process.MainWindowHandle -ne 0) {
    [void][PhonakTargetPalioWin32]::ShowWindow($Process.MainWindowHandle, 9)
    [void][PhonakTargetPalioWin32]::SetForegroundWindow($Process.MainWindowHandle)
  }
}

$existingWindow = Get-PalioWindowProcess
if ($existingWindow) {
  Bring-WindowToFront $existingWindow
  "Status=AlreadyOpen"
  "ProcessName=$($existingWindow.ProcessName)"
  "Pid=$($existingWindow.Id)"
  "WindowTitle=$($existingWindow.MainWindowTitle)"
  "MainWindowHandle=$($existingWindow.MainWindowHandle)"
  exit 0
}

if (-not (Test-Path -LiteralPath $PalioStudioPath)) {
  throw "PalioStudio.exe not found: $PalioStudioPath"
}

$workingDirectory = [System.IO.Path]::GetDirectoryName($PalioStudioPath)

# Use ProcessStartInfo instead of Start-Process because the default path
# contains square brackets, which PowerShell can treat as wildcards.
$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = $PalioStudioPath
$processInfo.WorkingDirectory = $workingDirectory
$processInfo.UseShellExecute = $false
$startedProcess = [System.Diagnostics.Process]::Start($processInfo)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$palioWindow = $null
do {
  Start-Sleep -Milliseconds 700
  $palioWindow = Get-PalioWindowProcess
  if ($palioWindow) {
    break
  }
} until ((Get-Date) -ge $deadline)

if ($palioWindow) {
  Bring-WindowToFront $palioWindow
  "Status=Opened"
  "LaunchPid=$($startedProcess.Id)"
  "ProcessName=$($palioWindow.ProcessName)"
  "Pid=$($palioWindow.Id)"
  "WindowTitle=$($palioWindow.MainWindowTitle)"
  "MainWindowHandle=$($palioWindow.MainWindowHandle)"
} else {
  "Status=StartedNoWindowDetected"
  "LaunchPid=$($startedProcess.Id)"
  "Path=$PalioStudioPath"
}
