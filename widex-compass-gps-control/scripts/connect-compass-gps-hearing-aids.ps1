param(
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 30,
  [switch]$Disconnect,
  [switch]$ConfirmDeviceAction
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

if (-not $ConfirmDeviceAction) {
  throw "Device action not confirmed. Re-run with -ConfirmDeviceAction after confirming the intended hearing aids and programming interface."
}

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds

if ($Disconnect) {
  $button = Find-WidexElement `
    -ProcessId $process.Id `
    -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.DisconnectBtn"
  $action = "Disconnect"
} else {
  $buttons = @(Find-WidexElements `
    -ProcessId $process.Id `
    -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.ConnectBtn")
  $button = $buttons | Where-Object { $_.Current.IsEnabled } | Select-Object -First 1
  $action = "Connect"
}

if (-not $button) { throw "$action button was not found." }
if (-not $button.Current.IsEnabled) { throw "$action button is disabled." }

$method = Invoke-WidexElement -Element $button -Description "$action button"
Start-Sleep -Milliseconds 900

$disconnectAfter = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.DisconnectBtn"
$connectAfter = @(Find-WidexElements `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.ConnectBtn")

[pscustomobject]@{
  Status = "Invoked"
  Action = $action
  Method = $method
  ConnectEnabledAfter = [bool](@($connectAfter | Where-Object { $_.Current.IsEnabled }).Count -gt 0)
  DisconnectEnabledAfter = if ($disconnectAfter) { $disconnectAfter.Current.IsEnabled } else { $false }
}
