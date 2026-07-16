param(
  [string]$SearchText,
  [string]$FirstName,
  [string]$LastName,
  [string]$ClientId,
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 20,
  [switch]$SelectOnly
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

if (-not $SearchText -and -not $FirstName -and -not $LastName -and -not $ClientId) {
  throw "Provide -SearchText, -FirstName, -LastName, or -ClientId."
}

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$browser = Wait-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "PatientBrowserView.Dialog" `
  -TimeoutSeconds $TimeoutSeconds

$query = if ($SearchText) {
  $SearchText
} else {
  (@($FirstName, $LastName, $ClientId) | Where-Object { $_ }) -join " "
}

$searchBox = Find-WidexElement `
  -ProcessId $process.Id `
  -Root $browser `
  -AutomationId "Widex.Compass.PatientBrowser.SearchText"
$searchButton = Find-WidexElement `
  -ProcessId $process.Id `
  -Root $browser `
  -AutomationId "Widex.Compass.PatientBrowser.Search"
Set-WidexValue -Element $searchBox -Value $query -Description "Patient search"
$searchMethod = Invoke-WidexElement -Element $searchButton -Description "Patient search button"
Start-Sleep -Milliseconds 600

$browser = Find-WidexElement -ProcessId $process.Id -AutomationId "PatientBrowserView.Dialog"
$list = Find-WidexElement -ProcessId $process.Id -Root $browser -AutomationId "PatientList"
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

$matchedRows = @()
foreach ($item in $items) {
  $texts = @($item.Current.Name) + @(Get-WidexElementTexts $item)
  $blob = $texts -join " "
  $ok = $true
  foreach ($selector in @($FirstName, $LastName, $ClientId) | Where-Object { $_ }) {
    if ($blob -notmatch [regex]::Escape($selector)) { $ok = $false }
  }
  if ($SearchText -and $blob -notmatch [regex]::Escape($SearchText)) { $ok = $false }
  if ($ok) {
    $matchedRows += [pscustomobject]@{ Element = $item; Text = ($texts | Where-Object { $_ }) -join " | " }
  }
}

if ($matchedRows.Count -eq 0) {
  throw "No matching patient was found. Query='$query'."
}
if ($matchedRows.Count -gt 1) {
  throw "Multiple patients matched. Refine the selector. Matches=$($matchedRows.Text -join '; ')"
}

$selectMethod = Select-WidexElement -Element $matchedRows[0].Element -Description "Patient row"
Start-Sleep -Milliseconds 450

if ($SelectOnly) {
  $status = "Selected"
  $openMethod = "None"
} else {
  $browser = Find-WidexElement -ProcessId $process.Id -AutomationId "PatientBrowserView.Dialog"
  $selectButton = Find-WidexElement `
    -ProcessId $process.Id `
    -Root $browser `
    -AutomationId "Widex.Compass.PatientBrowser.SelectPatient"
  if (-not $selectButton.Current.IsEnabled) {
    throw "Select patient button is disabled after selecting the matching row."
  }
  $openMethod = Invoke-WidexElement -Element $selectButton -Description "Select patient button"
  Start-Sleep -Milliseconds 900
  $status = "OpenInvoked"
}

[pscustomobject]@{
  Status = $status
  ProcessId = $process.Id
  Query = $query
  MatchedText = $matchedRows[0].Text
  SearchMethod = $searchMethod
  SelectMethod = $selectMethod
  OpenMethod = $openMethod
}
