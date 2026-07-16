param(
  [string]$DeviceName,
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 10,
  [switch]$ListAvailable,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$combo = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ProgrammingInterfaceView.ProgrammingDevice"
if (-not $combo) { throw "Programming device ComboBox was not found." }

$current = Get-WidexComboSelection $combo
if ($ListAvailable) {
  $available = @(Get-WidexComboOptions -ProcessId $process.Id -ComboBox $combo)
  [pscustomobject]@{
    Status = "Available"
    Current = $current
    Devices = @($available)
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($DeviceName)) {
  throw "Provide -DeviceName or -ListAvailable."
}

if ($DryRun) {
  [pscustomobject]@{
    Status = "DryRun"
    Current = $current
    Requested = $DeviceName
  }
  exit 0
}

$method = Set-WidexComboSelection -ProcessId $process.Id -ComboBox $combo -ItemName $DeviceName
Start-Sleep -Milliseconds 400
$combo = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ProgrammingInterfaceView.ProgrammingDevice"
$after = Get-WidexComboSelection $combo
if ($after -ne $DeviceName) {
  throw "Programming device verification failed. Expected='$DeviceName' Actual='$after'."
}

[pscustomobject]@{
  Status = "Set"
  Previous = $current
  Current = $after
  Method = $method
}
