param(
  [string]$CompassAssistantTitlePattern = "^Compass\.?$",
  [string]$WidexTitlePattern = "WIDEX COMPASS GPS",
  [double]$AssistantWidthRatio = 0.30,
  [int]$MinAssistantWidth = 420,
  [int]$MinWidexWidth = 760,
  [int]$VisualJoinOverlapPx = 6,
  [int]$TolerancePx = 12
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"
Add-Type -AssemblyName System.Windows.Forms

if ($AssistantWidthRatio -lt 0.20 -or $AssistantWidthRatio -gt 0.50) {
  throw "AssistantWidthRatio must be between 0.20 and 0.50."
}

function Get-LayoutBounds {
  param([IntPtr]$Handle)

  $windowRect = New-Object WidexCompassGpsWin32+RECT
  if (-not [WidexCompassGpsWin32]::GetWindowRect($Handle, [ref]$windowRect)) {
    throw "GetWindowRect failed."
  }

  $visualRect = New-Object WidexCompassGpsWin32+RECT
  $dwmCode = [WidexCompassGpsWin32]::DwmGetWindowAttribute(
    $Handle,
    9,
    [ref]$visualRect,
    [Runtime.InteropServices.Marshal]::SizeOf([type][WidexCompassGpsWin32+RECT])
  )
  if ($dwmCode -ne 0 -or $visualRect.Right -le $visualRect.Left) {
    $visualRect = $windowRect
  }

  [pscustomobject]@{
    WindowRect = $windowRect
    VisualRect = $visualRect
    InsetLeft = $visualRect.Left - $windowRect.Left
    InsetTop = $visualRect.Top - $windowRect.Top
    InsetRight = $windowRect.Right - $visualRect.Right
    InsetBottom = $windowRect.Bottom - $visualRect.Bottom
  }
}

function ConvertTo-LayoutPlacement {
  param(
    [int]$VisualLeft,
    [int]$VisualTop,
    [int]$VisualWidth,
    [int]$VisualHeight,
    $Bounds
  )

  [pscustomobject]@{
    X = $VisualLeft - $Bounds.InsetLeft
    Y = $VisualTop - $Bounds.InsetTop
    Width = $VisualWidth + $Bounds.InsetLeft + $Bounds.InsetRight
    Height = $VisualHeight + $Bounds.InsetTop + $Bounds.InsetBottom
  }
}

function Format-Rect {
  param($Rect)
  "L=$($Rect.Left) T=$($Rect.Top) R=$($Rect.Right) B=$($Rect.Bottom) W=$($Rect.Right-$Rect.Left) H=$($Rect.Bottom-$Rect.Top)"
}

$assistant = @("Compass", "compass", "electron") |
  ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue } |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match $CompassAssistantTitlePattern } |
  Select-Object -First 1
if (-not $assistant) { throw "Compass assistant window was not found. TitlePattern=$CompassAssistantTitlePattern" }

$widexProcess = Wait-WidexCompassGpsProcess -TimeoutSeconds 10
$widexElement = Get-WidexMainWindowElement -ProcessId $widexProcess.Id -TimeoutSeconds 10
$widexHandle = [IntPtr]$widexElement.Current.NativeWindowHandle
if ($widexHandle -eq [IntPtr]::Zero) { throw "WIDEX COMPASS GPS main window handle was not found." }
if ($widexElement.Current.Name -notmatch $WidexTitlePattern) {
  throw "Unexpected WIDEX window title: $($widexElement.Current.Name)"
}

$screen = [System.Windows.Forms.Screen]::FromHandle($assistant.MainWindowHandle)
$area = $screen.WorkingArea
$assistantWidth = [int][Math]::Round($area.Width * $AssistantWidthRatio)
$assistantWidth = [Math]::Max($MinAssistantWidth, $assistantWidth)
$assistantWidth = [Math]::Min($assistantWidth, $area.Width - $MinWidexWidth)
if ($assistantWidth -lt $MinAssistantWidth) {
  throw "Working area is too narrow for the requested layout."
}
$widexWidth = $area.Width - $assistantWidth
$widexLeft = $area.Left + $assistantWidth - $VisualJoinOverlapPx
$widexVisualWidth = $widexWidth + $VisualJoinOverlapPx

[void][WidexCompassGpsWin32]::ShowWindow($assistant.MainWindowHandle, 9)
[void][WidexCompassGpsWin32]::ShowWindow($widexHandle, 9)
Start-Sleep -Milliseconds 150

$assistantInitial = Get-LayoutBounds $assistant.MainWindowHandle
$widexInitial = Get-LayoutBounds $widexHandle
$assistantPlacement = ConvertTo-LayoutPlacement `
  -VisualLeft $area.Left `
  -VisualTop $area.Top `
  -VisualWidth $assistantWidth `
  -VisualHeight $area.Height `
  -Bounds $assistantInitial
$widexPlacement = ConvertTo-LayoutPlacement `
  -VisualLeft $widexLeft `
  -VisualTop $area.Top `
  -VisualWidth $widexVisualWidth `
  -VisualHeight $area.Height `
  -Bounds $widexInitial

$flags = 0x0010
$assistantMove = [WidexCompassGpsWin32]::SetWindowPos(
  $assistant.MainWindowHandle,
  [IntPtr]::Zero,
  $assistantPlacement.X,
  $assistantPlacement.Y,
  $assistantPlacement.Width,
  $assistantPlacement.Height,
  $flags
)
$widexMove = [WidexCompassGpsWin32]::SetWindowPos(
  $widexHandle,
  [IntPtr]::Zero,
  $widexPlacement.X,
  $widexPlacement.Y,
  $widexPlacement.Width,
  $widexPlacement.Height,
  $flags
)
if (-not $assistantMove -or -not $widexMove) {
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "SetWindowPos failed. Win32Error=$code"
}

Start-Sleep -Milliseconds 450
$assistantFinal = Get-LayoutBounds $assistant.MainWindowHandle
$widexFinal = Get-LayoutBounds $widexHandle
$assistantVisualWidth = $assistantFinal.VisualRect.Right - $assistantFinal.VisualRect.Left
$widexVisualWidthAfter = $widexFinal.VisualRect.Right - $widexFinal.VisualRect.Left
$seamDelta = $widexFinal.VisualRect.Left - $assistantFinal.VisualRect.Right

$assistantOk = [Math]::Abs($assistantVisualWidth - $assistantWidth) -le $TolerancePx
$widexOk = [Math]::Abs($widexVisualWidthAfter - $widexVisualWidth) -le $TolerancePx
$seamOk = [Math]::Abs($seamDelta + $VisualJoinOverlapPx) -le $TolerancePx

[pscustomobject]@{
  Status = if ($assistantOk -and $widexOk -and $seamOk) { "Arranged" } else { "VerificationFailed" }
  Screen = $screen.DeviceName
  WorkArea = "L=$($area.Left) T=$($area.Top) W=$($area.Width) H=$($area.Height)"
  AppliedRatio = "Compass=$([Math]::Round(($assistantWidth/$area.Width)*100,1))% Widex=$([Math]::Round(($widexWidth/$area.Width)*100,1))%"
  CompassMoveOk = $assistantMove
  CompassVisualRect = Format-Rect $assistantFinal.VisualRect
  CompassWidthOk = $assistantOk
  WidexMoveOk = $widexMove
  WidexVisualRect = Format-Rect $widexFinal.VisualRect
  WidexWidthOk = $widexOk
  SeamDeltaPx = $seamDelta
  SeamOk = $seamOk
}

if (-not ($assistantOk -and $widexOk -and $seamOk)) {
  throw "Window layout verification failed."
}
