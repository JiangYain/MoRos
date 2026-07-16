param(
  [string]$OutputPath,
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [ValidateSet("MainWindow", "ForegroundDialog")]
  [string]$CaptureTarget = "MainWindow",
  [switch]$IncludeWindowFrame,
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"
Add-Type -AssemblyName System.Drawing

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$main = Get-WidexMainWindowElement -ProcessId $process.Id -TimeoutSeconds $TimeoutSeconds

if ($CaptureTarget -eq "ForegroundDialog") {
  $dialogIds = @("PatientDetails.Dialog", "PatientBrowserView.Dialog", "TheDialog")
  $element = $null
  foreach ($id in $dialogIds) {
    $candidate = Find-WidexElement -ProcessId $process.Id -AutomationId $id
    if ($candidate -and -not $candidate.Current.IsOffscreen) {
      $element = $candidate
      break
    }
  }
  if (-not $element) { throw "No recognized visible COMPASS GPS dialog was found." }
} else {
  $element = $main
}

$handle = [IntPtr]$element.Current.NativeWindowHandle
if ($handle -eq [IntPtr]::Zero) {
  $handle = [IntPtr]$main.Current.NativeWindowHandle
}
if ($handle -eq [IntPtr]::Zero) { throw "Selected COMPASS GPS element has no native window handle." }

[void][WidexCompassGpsWin32]::ShowWindow($handle, 9)
[void][WidexCompassGpsWin32]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 450

if ($IncludeWindowFrame) {
  $rect = New-Object WidexCompassGpsWin32+RECT
  if (-not [WidexCompassGpsWin32]::GetWindowRect($handle, [ref]$rect)) {
    throw "GetWindowRect failed."
  }
  $left = $rect.Left
  $top = $rect.Top
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $mode = "WindowFrame"
} else {
  $rect = New-Object WidexCompassGpsWin32+RECT
  if (-not [WidexCompassGpsWin32]::GetClientRect($handle, [ref]$rect)) {
    throw "GetClientRect failed."
  }
  $point = New-Object WidexCompassGpsWin32+POINT
  $point.X = 0
  $point.Y = 0
  if (-not [WidexCompassGpsWin32]::ClientToScreen($handle, [ref]$point)) {
    throw "ClientToScreen failed."
  }
  $left = $point.X
  $top = $point.Y
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $mode = "ClientArea"
}

if ($width -le 0 -or $height -le 0) { throw "Invalid capture rectangle: ${width}x${height}." }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "widex-compass-gps-$stamp.png"
}
$directory = Split-Path -Path $OutputPath -Parent
if ($directory -and -not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$bitmap = $null
$graphics = $null
try {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen(
    $left,
    $top,
    0,
    0,
    (New-Object System.Drawing.Size($width, $height))
  )
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  if ($graphics) { $graphics.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
}

[pscustomobject]@{
  Status = "Captured"
  OutputPath = (Get-Item -LiteralPath $OutputPath).FullName
  CaptureTarget = $CaptureTarget
  CaptureMode = $mode
  Width = $width
  Height = $height
  WindowTitle = $element.Current.Name
  AutomationId = $element.Current.AutomationId
}
