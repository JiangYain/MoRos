param(
  [string]$CompassTitlePattern = "^Compass\.?$",
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$MinCompassWidth = 420,
  [int]$MinTargetWidth = 640,
  [int]$VisualJoinOverlapPx = 8,
  [int]$TolerancePx = 12
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

$compassProcessNames = @("Compass", "compass", "electron")
$compass = $compassProcessNames |
  ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue } |
  Where-Object {
    $_.MainWindowHandle -ne 0 -and
    $_.MainWindowTitle -match $CompassTitlePattern
  } |
  Select-Object -First 1

$target = Get-Process -Name Target -ErrorAction SilentlyContinue |
  Where-Object {
    $_.MainWindowHandle -ne 0 -and
    $_.MainWindowTitle -match $TargetTitlePattern
  } |
  Select-Object -First 1

if (-not $compass) {
  throw "Compass main window not found. Expected title pattern: $CompassTitlePattern"
}

if (-not $target) {
  throw "Phonak Target main window not found. Expected title pattern: $TargetTitlePattern"
}

$screen = [System.Windows.Forms.Screen]::FromHandle($compass.MainWindowHandle)
$area = $screen.WorkingArea

$compassWidthRatio = 0.254
$requestedLeftWidth = [int][Math]::Floor($area.Width * $compassWidthRatio)
$maxLeftWidth = [int]($area.Width - $MinTargetWidth)

if ($maxLeftWidth -lt $MinCompassWidth) {
  throw "Working area is too narrow for the requested layout. WorkAreaWidth=$($area.Width), MinCompassWidth=$MinCompassWidth, MinTargetWidth=$MinTargetWidth"
}

$leftWidth = [int][Math]::Min($maxLeftWidth, [Math]::Max($requestedLeftWidth, $MinCompassWidth))
$rightWidth = [int]($area.Width - $leftWidth)
$joinOverlapPx = [int][Math]::Max(0, $VisualJoinOverlapPx)
$targetLeft = [int]($area.Left + $leftWidth - $joinOverlapPx)
$targetWidth = [int]($rightWidth + $joinOverlapPx)

$swRestore = 9
$swpNoActivate = 0x0010
$swpNoMove = 0x0002
$swpNoSize = 0x0001
$hwndTopMost = [IntPtr](-1)
$hwndNoTopMost = [IntPtr](-2)

[void][PhonakTargetWindowLayout]::ShowWindow($compass.MainWindowHandle, $swRestore)
[void][PhonakTargetWindowLayout]::ShowWindow($target.MainWindowHandle, $swRestore)

$compassMoveOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $compass.MainWindowHandle,
  [IntPtr]::Zero,
  $area.Left,
  $area.Top,
  $leftWidth,
  $area.Height,
  $swpNoActivate
)

if (-not $compassMoveOk) {
  $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Failed to move Compass window. Win32 error: $errorCode"
}

$targetMoveOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $target.MainWindowHandle,
  [IntPtr]::Zero,
  $targetLeft,
  $area.Top,
  $targetWidth,
  $area.Height,
  $swpNoActivate
)

if (-not $targetMoveOk) {
  $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Failed to move Target window. Win32 error: $errorCode"
}

$zOrderFlags = $swpNoMove -bor $swpNoSize -bor $swpNoActivate
$compassTopMostOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $compass.MainWindowHandle,
  $hwndTopMost,
  0,
  0,
  0,
  0,
  $zOrderFlags
)
$targetTopMostOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $target.MainWindowHandle,
  $hwndTopMost,
  0,
  0,
  0,
  0,
  $zOrderFlags
)
$compassNoTopMostOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $compass.MainWindowHandle,
  $hwndNoTopMost,
  0,
  0,
  0,
  0,
  $zOrderFlags
)
$targetNoTopMostOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $target.MainWindowHandle,
  $hwndNoTopMost,
  0,
  0,
  0,
  0,
  $zOrderFlags
)

Start-Sleep -Milliseconds 500

$compassRect = New-Object PhonakTargetWindowLayout+RECT
$targetRect = New-Object PhonakTargetWindowLayout+RECT

[void][PhonakTargetWindowLayout]::GetWindowRect($compass.MainWindowHandle, [ref]$compassRect)
[void][PhonakTargetWindowLayout]::GetWindowRect($target.MainWindowHandle, [ref]$targetRect)

$actualCompassWidth = [int]($compassRect.Right - $compassRect.Left)
$actualCompassHeight = [int]($compassRect.Bottom - $compassRect.Top)
$actualTargetWidth = [int]($targetRect.Right - $targetRect.Left)
$actualTargetHeight = [int]($targetRect.Bottom - $targetRect.Top)
$expectedCompassLeft = [int]$area.Left
$expectedTargetLeft = [int]$targetLeft

$compassLeftOk = [Math]::Abs($compassRect.Left - $expectedCompassLeft) -le $TolerancePx
$compassWidthOk = [Math]::Abs($actualCompassWidth - $leftWidth) -le $TolerancePx
$targetLeftOk = [Math]::Abs($targetRect.Left - $expectedTargetLeft) -le $TolerancePx
$targetWidthOk = [Math]::Abs($actualTargetWidth - $targetWidth) -le $TolerancePx
$seamDeltaPx = [int]($targetRect.Left - $compassRect.Right)
$seamOk = [Math]::Abs($seamDeltaPx + $joinOverlapPx) -le $TolerancePx
$noOverlap = $seamDeltaPx -ge -($joinOverlapPx + $TolerancePx)

$result = [pscustomobject]@{
  Screen = $screen.DeviceName
  WorkArea = "L=$($area.Left) T=$($area.Top) W=$($area.Width) H=$($area.Height)"
  RequestedLayoutRatio = "Compass=$([Math]::Round(($requestedLeftWidth / $area.Width) * 100, 1))% Target=$([Math]::Round((($area.Width - $requestedLeftWidth) / $area.Width) * 100, 1))%"
  AppliedLayoutRatio = "Compass=$([Math]::Round(($leftWidth / $area.Width) * 100, 1))% Target=$([Math]::Round(($rightWidth / $area.Width) * 100, 1))%"
  ExpectedCompassWidth = $leftWidth
  ExpectedTargetLeft = $expectedTargetLeft
  VisualJoinOverlapPx = $joinOverlapPx
  CompassMoveOk = $compassMoveOk
  CompassRect = "L=$($compassRect.Left) T=$($compassRect.Top) R=$($compassRect.Right) B=$($compassRect.Bottom) W=$actualCompassWidth H=$actualCompassHeight"
  CompassLeftOk = $compassLeftOk
  CompassWidthOk = $compassWidthOk
  CompassBringForwardOk = ($compassTopMostOk -and $compassNoTopMostOk)
  TargetMoveOk = $targetMoveOk
  TargetRect = "L=$($targetRect.Left) T=$($targetRect.Top) R=$($targetRect.Right) B=$($targetRect.Bottom) W=$actualTargetWidth H=$actualTargetHeight"
  TargetLeftOk = $targetLeftOk
  TargetWidthOk = $targetWidthOk
  TargetBringForwardOk = ($targetTopMostOk -and $targetNoTopMostOk)
  SeamDeltaPx = $seamDeltaPx
  SeamOk = $seamOk
  NoOverlap = $noOverlap
} 

$result | Format-List

if (-not ($compassLeftOk -and $compassWidthOk -and $targetLeftOk -and $targetWidthOk -and $seamOk -and $noOverlap)) {
  throw "Window layout verification failed. Compass/Target final GetWindowRect values do not match the requested seam-adjusted layout."
}
