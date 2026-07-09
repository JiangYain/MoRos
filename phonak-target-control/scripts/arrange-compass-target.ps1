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
  public static extern bool SetProcessDPIAware();

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

  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(
    IntPtr hwnd,
    int dwAttribute,
    out RECT pvAttribute,
    int cbAttribute
  );

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

[void][PhonakTargetWindowLayout]::SetProcessDPIAware()

function Get-RectText {
  param($Rect)

  $width = [int]($Rect.Right - $Rect.Left)
  $height = [int]($Rect.Bottom - $Rect.Top)
  "L=$($Rect.Left) T=$($Rect.Top) R=$($Rect.Right) B=$($Rect.Bottom) W=$width H=$height"
}

function Get-WindowBounds {
  param([IntPtr]$Handle)

  $windowRect = New-Object PhonakTargetWindowLayout+RECT
  if (-not [PhonakTargetWindowLayout]::GetWindowRect($Handle, [ref]$windowRect)) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Failed to read window rect. Win32 error: $errorCode"
  }

  $visualRect = New-Object PhonakTargetWindowLayout+RECT
  $dwmCode = [PhonakTargetWindowLayout]::DwmGetWindowAttribute(
    $Handle,
    9,
    [ref]$visualRect,
    [Runtime.InteropServices.Marshal]::SizeOf([type][PhonakTargetWindowLayout+RECT])
  )

  $hasVisualRect = $dwmCode -eq 0 -and
    $visualRect.Right -gt $visualRect.Left -and
    $visualRect.Bottom -gt $visualRect.Top

  if (-not $hasVisualRect) {
    $visualRect = $windowRect
  }

  [pscustomobject]@{
    WindowRect = $windowRect
    VisualRect = $visualRect
    DwmReturnCode = $dwmCode
    InsetLeft = [int]($visualRect.Left - $windowRect.Left)
    InsetTop = [int]($visualRect.Top - $windowRect.Top)
    InsetRight = [int]($windowRect.Right - $visualRect.Right)
    InsetBottom = [int]($windowRect.Bottom - $visualRect.Bottom)
  }
}

function ConvertTo-WindowPlacement {
  param(
    [int]$VisualLeft,
    [int]$VisualTop,
    [int]$VisualWidth,
    [int]$VisualHeight,
    $Bounds
  )

  [pscustomobject]@{
    X = [int]($VisualLeft - $Bounds.InsetLeft)
    Y = [int]($VisualTop - $Bounds.InsetTop)
    Width = [int]($VisualWidth + $Bounds.InsetLeft + $Bounds.InsetRight)
    Height = [int]($VisualHeight + $Bounds.InsetTop + $Bounds.InsetBottom)
  }
}

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
Start-Sleep -Milliseconds 150

$compassInitialBounds = Get-WindowBounds $compass.MainWindowHandle
$targetInitialBounds = Get-WindowBounds $target.MainWindowHandle

$compassPlacement = ConvertTo-WindowPlacement `
  -VisualLeft $area.Left `
  -VisualTop $area.Top `
  -VisualWidth $leftWidth `
  -VisualHeight $area.Height `
  -Bounds $compassInitialBounds

$targetPlacement = ConvertTo-WindowPlacement `
  -VisualLeft $targetLeft `
  -VisualTop $area.Top `
  -VisualWidth $targetWidth `
  -VisualHeight $area.Height `
  -Bounds $targetInitialBounds

$compassMoveOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $compass.MainWindowHandle,
  [IntPtr]::Zero,
  $compassPlacement.X,
  $compassPlacement.Y,
  $compassPlacement.Width,
  $compassPlacement.Height,
  $swpNoActivate
)

if (-not $compassMoveOk) {
  $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Failed to move Compass window. Win32 error: $errorCode"
}

$targetMoveOk = [PhonakTargetWindowLayout]::SetWindowPos(
  $target.MainWindowHandle,
  [IntPtr]::Zero,
  $targetPlacement.X,
  $targetPlacement.Y,
  $targetPlacement.Width,
  $targetPlacement.Height,
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

$compassBounds = Get-WindowBounds $compass.MainWindowHandle
$targetBounds = Get-WindowBounds $target.MainWindowHandle

$compassRect = $compassBounds.WindowRect
$targetRect = $targetBounds.WindowRect
$compassVisualRect = $compassBounds.VisualRect
$targetVisualRect = $targetBounds.VisualRect

$actualCompassWidth = [int]($compassVisualRect.Right - $compassVisualRect.Left)
$actualCompassHeight = [int]($compassVisualRect.Bottom - $compassVisualRect.Top)
$actualTargetWidth = [int]($targetVisualRect.Right - $targetVisualRect.Left)
$actualTargetHeight = [int]($targetVisualRect.Bottom - $targetVisualRect.Top)
$expectedCompassLeft = [int]$area.Left
$expectedTargetLeft = [int]$targetLeft

$edgeTolerancePx = [Math]::Min($TolerancePx, 2)
$compassLeftOk = [Math]::Abs($compassVisualRect.Left - $expectedCompassLeft) -le $edgeTolerancePx
$compassWidthOk = [Math]::Abs($actualCompassWidth - $leftWidth) -le $TolerancePx
$targetLeftOk = [Math]::Abs($targetVisualRect.Left - $expectedTargetLeft) -le $TolerancePx
$targetWidthOk = [Math]::Abs($actualTargetWidth - $targetWidth) -le $TolerancePx
$seamDeltaPx = [int]($targetVisualRect.Left - $compassVisualRect.Right)
$seamOk = [Math]::Abs($seamDeltaPx + $joinOverlapPx) -le $TolerancePx
$overlapWithinTolerance = $seamDeltaPx -ge -($joinOverlapPx + $TolerancePx)

$result = [pscustomobject]@{
  Screen = $screen.DeviceName
  WorkArea = "L=$($area.Left) T=$($area.Top) W=$($area.Width) H=$($area.Height)"
  CoordinateSpace = "DPI-aware physical pixels"
  RequestedLayoutRatio = "Compass=$([Math]::Round(($requestedLeftWidth / $area.Width) * 100, 1))% Target=$([Math]::Round((($area.Width - $requestedLeftWidth) / $area.Width) * 100, 1))%"
  AppliedLayoutRatio = "Compass=$([Math]::Round(($leftWidth / $area.Width) * 100, 1))% Target=$([Math]::Round(($rightWidth / $area.Width) * 100, 1))%"
  ExpectedCompassWidth = $leftWidth
  ExpectedTargetLeft = $expectedTargetLeft
  VisualJoinOverlapPx = $joinOverlapPx
  CompassMoveOk = $compassMoveOk
  CompassWindowRect = Get-RectText $compassRect
  CompassVisualRect = Get-RectText $compassVisualRect
  CompassVisualInsets = "L=$($compassBounds.InsetLeft) T=$($compassBounds.InsetTop) R=$($compassBounds.InsetRight) B=$($compassBounds.InsetBottom)"
  CompassLeftOk = $compassLeftOk
  CompassWidthOk = $compassWidthOk
  CompassBringForwardOk = ($compassTopMostOk -and $compassNoTopMostOk)
  TargetMoveOk = $targetMoveOk
  TargetWindowRect = Get-RectText $targetRect
  TargetVisualRect = Get-RectText $targetVisualRect
  TargetVisualInsets = "L=$($targetBounds.InsetLeft) T=$($targetBounds.InsetTop) R=$($targetBounds.InsetRight) B=$($targetBounds.InsetBottom)"
  TargetLeftOk = $targetLeftOk
  TargetWidthOk = $targetWidthOk
  TargetBringForwardOk = ($targetTopMostOk -and $targetNoTopMostOk)
  SeamDeltaPx = $seamDeltaPx
  SeamOk = $seamOk
  OverlapWithinTolerance = $overlapWithinTolerance
} 

$result | Format-List

if (-not ($compassLeftOk -and $compassWidthOk -and $targetLeftOk -and $targetWidthOk -and $seamOk -and $overlapWithinTolerance)) {
  throw "Window layout verification failed. Compass/Target final visual bounds do not match the requested seam-adjusted layout."
}
