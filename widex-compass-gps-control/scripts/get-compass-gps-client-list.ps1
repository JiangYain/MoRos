param(
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$browser = Wait-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "PatientBrowserView.Dialog" `
  -TimeoutSeconds $TimeoutSeconds
$list = Find-WidexElement -ProcessId $process.Id -Root $browser -AutomationId "PatientList"
if (-not $list) { throw "PatientList was not found in the stand-alone database window." }

$items = @(
  Find-WidexElements `
    -ProcessId $process.Id `
    -Root $list `
    -ControlType ([System.Windows.Automation.ControlType]::ListItem) |
    Where-Object { -not $_.Current.IsOffscreen }
)
if ($items.Count -eq 0) {
  $items = @(
    Find-WidexElements `
      -ProcessId $process.Id `
      -Root $list `
      -ControlType ([System.Windows.Automation.ControlType]::DataItem) |
      Where-Object { -not $_.Current.IsOffscreen }
  )
}

$rows = @(for ($i = 0; $i -lt $items.Count; $i++) {
  $texts = @(Get-WidexElementTexts $items[$i])
  [pscustomobject]@{
    Index = $i
    Name = $items[$i].Current.Name
    Text = ($texts -join " | ")
    Selected = Get-WidexSelectionState $items[$i]
  }
})

[pscustomobject]@{
  Status = "Read"
  Count = $rows.Count
  ProcessId = $process.Id
  Clients = @($rows)
}
