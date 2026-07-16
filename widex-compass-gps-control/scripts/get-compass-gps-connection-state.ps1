param(
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$combo = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ProgrammingInterfaceView.ProgrammingDevice"
$connectButtons = @(Find-WidexElements `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.ConnectBtn")
$disconnect = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.DisconnectBtn"
$status = Find-WidexElement -ProcessId $process.Id -AutomationId "StatusMessages"
$connection = Find-WidexElement -ProcessId $process.Id -AutomationId "ConnectionStatus"
$rightBattery = Find-WidexElement -ProcessId $process.Id -AutomationId "RightBatteryStatusMessage"
$leftBattery = Find-WidexElement -ProcessId $process.Id -AutomationId "LeftBatteryStatusMessage"

[pscustomobject]@{
  Status = "Read"
  ProcessId = $process.Id
  ProgrammingDevice = if ($combo) { Get-WidexComboSelection $combo } else { "" }
  ConnectEnabled = [bool](@($connectButtons | Where-Object { $_.Current.IsEnabled }).Count -gt 0)
  DisconnectEnabled = if ($disconnect) { $disconnect.Current.IsEnabled } else { $false }
  ConnectionTexts = if ($connection) { (Get-WidexElementTexts $connection) -join " | " } else { "" }
  StatusTexts = if ($status) { (Get-WidexElementTexts $status) -join " | " } else { "" }
  RightBattery = if ($rightBattery) { (Get-WidexElementTexts $rightBattery) -join " | " } else { "" }
  LeftBattery = if ($leftBattery) { (Get-WidexElementTexts $leftBattery) -join " | " } else { "" }
}
