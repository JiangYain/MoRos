param(
  [string]$TargetTitlePattern = "Phonak Target 12\.0"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetWindowLayout {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(
    IntPtr hWnd,
    IntPtr hWndInsertAfter,
    int X,
    int Y,
    int cx,
    int cy,
    uint uFlags
  );

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

$codex = Get-Process -Name Codex -ErrorAction Stop |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1

$target = Get-Process -Name Target -ErrorAction Stop |
  Where-Object {
    $_.MainWindowHandle -ne 0 -and
    $_.MainWindowTitle -match $TargetTitlePattern
  } |
  Select-Object -First 1

if (-not $codex) {
  throw "Codex main window not found."
}

if (-not $target) {
  throw "Phonak Target main window not found. Expected title pattern: $TargetTitlePattern"
}

$screen = [System.Windows.Forms.Screen]::FromHandle($codex.MainWindowHandle)
$area = $screen.WorkingArea

$codexWidthRatio = 0.254
$leftWidth = [int][Math]::Floor($area.Width * $codexWidthRatio)
$rightWidth = [int]($area.Width - $leftWidth)

$swRestore = 9
$swpNoActivate = 0x0010

[void][PhonakTargetWindowLayout]::ShowWindow($codex.MainWindowHandle, $swRestore)
[void][PhonakTargetWindowLayout]::ShowWindow($target.MainWindowHandle, $swRestore)

$codexMoveOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $codex.MainWindowHandle,
  [IntPtr]::Zero,
  $area.Left,
  $area.Top,
  $leftWidth,
  $area.Height,
  $swpNoActivate
)

if (-not $codexMoveOk) {
  $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Failed to move Codex window. Win32 error: $errorCode"
}

$targetMoveOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $target.MainWindowHandle,
  [IntPtr]::Zero,
  $area.Left + $leftWidth,
  $area.Top,
  $rightWidth,
  $area.Height,
  $swpNoActivate
)

if (-not $targetMoveOk) {
  $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Failed to move Target window. Win32 error: $errorCode"
}

Start-Sleep -Milliseconds 500

$codexRect = New-Object PhonakTargetWindowLayout+RECT
$targetRect = New-Object PhonakTargetWindowLayout+RECT

[void][PhonakTargetWindowLayout]::GetWindowRect($codex.MainWindowHandle, [ref]$codexRect)
[void][PhonakTargetWindowLayout]::GetWindowRect($target.MainWindowHandle, [ref]$targetRect)

[pscustomobject]@{
  Screen = $screen.DeviceName
  WorkArea = "L=$($area.Left) T=$($area.Top) W=$($area.Width) H=$($area.Height)"
  LayoutRatio = "Codex=$([Math]::Round(($leftWidth / $area.Width) * 100, 1))% Target=$([Math]::Round(($rightWidth / $area.Width) * 100, 1))%"
  CodexMoveOk = $codexMoveOk
  CodexRect = "L=$($codexRect.Left) T=$($codexRect.Top) R=$($codexRect.Right) B=$($codexRect.Bottom) W=$(($codexRect.Right - $codexRect.Left)) H=$(($codexRect.Bottom - $codexRect.Top))"
  TargetMoveOk = $targetMoveOk
  TargetRect = "L=$($targetRect.Left) T=$($targetRect.Top) R=$($targetRect.Right) B=$($targetRect.Bottom) W=$(($targetRect.Right - $targetRect.Left)) H=$(($targetRect.Bottom - $targetRect.Top))"
} | Format-List
