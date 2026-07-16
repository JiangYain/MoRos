param(
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 10,
  [switch]$ConfirmSave
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

if (-not $ConfirmSave) {
  throw "Session save not confirmed. Re-run with -ConfirmSave after reviewing the active client, hearing aids, and pending changes."
}

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$button = Find-WidexElement -ProcessId $process.Id -AutomationId "topIconSave"
if (-not $button) { throw "Session save button was not found." }
if (-not $button.Current.IsEnabled) { throw "Session save button is disabled; there may be no pending session changes." }

$method = Invoke-WidexElement -Element $button -Description "Session save button"
Start-Sleep -Milliseconds 700
$buttonAfter = Find-WidexElement -ProcessId $process.Id -AutomationId "topIconSave"

[pscustomobject]@{
  Status = "SaveInvoked"
  Method = $method
  SaveEnabledAfter = if ($buttonAfter) { $buttonAfter.Current.IsEnabled } else { $false }
}
