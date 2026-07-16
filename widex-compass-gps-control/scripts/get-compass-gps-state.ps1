param(
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$main = Find-WidexElement -ProcessId $process.Id -AutomationId "CompassMainWindow"
$login = Find-WidexElement -ProcessId $process.Id -AutomationId "TheDialog"
$patientBrowser = Find-WidexElement -ProcessId $process.Id -AutomationId "PatientBrowserView.Dialog"
$patientDetails = Find-WidexElement -ProcessId $process.Id -AutomationId "PatientDetails.Dialog"

$topTabs = [ordered]@{
  StartSession = "TopNavigation.StartSession"
  Selection = "TopNavigation.Selection"
  Fitting = "TopNavigation.Fitting"
  Finetuning = "TopNavigation.Finetuning"
  Logging = "TopNavigation.Logging"
  Handling = "TopNavigation.Handling"
  Close = "TopNavigation.Close"
}

$topStates = foreach ($entry in $topTabs.GetEnumerator()) {
  $element = Find-WidexElement -ProcessId $process.Id -AutomationId $entry.Value
  [pscustomobject]@{
    Name = $entry.Key
    AutomationId = $entry.Value
    Found = [bool]$element
    Enabled = if ($element) { $element.Current.IsEnabled } else { $false }
    Selected = if ($element) { Get-WidexSelectionState $element } else { $false }
  }
}

$programmingDevice = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ProgrammingInterfaceView.ProgrammingDevice"
$connectButtons = @(Find-WidexElements `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.ConnectBtn")
$disconnectButton = Find-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.DisconnectBtn"
$saveButton = Find-WidexElement -ProcessId $process.Id -AutomationId "topIconSave"

[pscustomobject]@{
  Status = "Inspected"
  ProcessId = $process.Id
  Path = $process.Path
  MainWindowFound = [bool]$main
  MainWindowTitle = if ($main) { $main.Current.Name } else { "" }
  LoginDialogOpen = [bool]$login
  PatientBrowserOpen = [bool]$patientBrowser
  PatientDetailsOpen = [bool]$patientDetails
  ProgrammingDevice = if ($programmingDevice) { Get-WidexComboSelection $programmingDevice } else { "" }
  ConnectEnabled = [bool](@($connectButtons | Where-Object { $_.Current.IsEnabled }).Count -gt 0)
  DisconnectEnabled = if ($disconnectButton) { $disconnectButton.Current.IsEnabled } else { $false }
  SaveEnabled = if ($saveButton) { $saveButton.Current.IsEnabled } else { $false }
  SelectedTopTab = (($topStates | Where-Object Selected | ForEach-Object Name) -join ",")
  TopTabs = @($topStates)
}
