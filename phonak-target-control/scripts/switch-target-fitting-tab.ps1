param(
  [string]$MainTab,
  [string]$SubTab,
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$TimeoutSeconds = 10,
  [switch]$DryRun,
  [switch]$ListAvailable
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetSwitchFittingTabWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function U {
  param([int[]]$Codes)
  -join ($Codes | ForEach-Object { [char]$_ })
}

$ZhClient = U 0x987E,0x5BA2
$ZhCustomer = U 0x5BA2,0x6237
$ZhInstruments = U 0x8BBE,0x5907
$ZhFitting = U 0x9A8C,0x914D
$ZhDetails = U 0x8BE6,0x60C5
$ZhAudiogram = U 0x542C,0x529B,0x56FE
$ZhHearingInstrument = U 0x52A9,0x542C,0x5668
$ZhAcousticParameters = U 0x58F0,0x5B66,0x53C2,0x6570
$ZhAccessory = U 0x8F85,0x4EF6
$ZhFeedbackRealEar = U 0x53CD,0x9988,0x548C,0x771F,0x8033,0x6D4B,0x8BD5
$ZhCouplingMeasurement = U 0x58F0,0x8026,0x5408,0x6D4B,0x91CF
$ZhInSitu = U 0x5185,0x7F6E,0x6D4B,0x542C
$ZhBasicTuning = U 0x57FA,0x672C,0x8C03,0x8282
$ZhFineTuning = U 0x7CBE,0x7EC6,0x8C03,0x8282
$ZhDataSave = U 0x6570,0x636E,0x50A8,0x5B58
$ZhDeviceOptions = U 0x8BBE,0x5907,0x9009,0x9879

$ClientInfo = @{
  Key = "Client"
  AutomationId = "Fitting.ClientTabItem"
  Display = $ZhClient
  SubTabs = @($ZhDetails, $ZhAudiogram, "RECD", "REUG")
}
$InstrumentsInfo = @{
  Key = "Instruments"
  AutomationId = "Fitting.InstrumentsTabItem"
  Display = $ZhInstruments
  SubTabs = @($ZhHearingInstrument, $ZhAcousticParameters, $ZhDetails, $ZhAccessory)
}
$FittingInfo = @{
  Key = "Fitting"
  AutomationId = "Fitting.FittingTabItem"
  Display = $ZhFitting
  SubTabs = @($ZhFeedbackRealEar, $ZhCouplingMeasurement, $ZhInSitu, $ZhBasicTuning, $ZhFineTuning, $ZhDataSave, $ZhDeviceOptions)
}

$MainTabMap = @{
  "client" = $ClientInfo
  "customer" = $ClientInfo
  "patient" = $ClientInfo
  $ZhClient = $ClientInfo
  $ZhCustomer = $ClientInfo
  "instruments" = $InstrumentsInfo
  "instrument" = $InstrumentsInfo
  "device" = $InstrumentsInfo
  "devices" = $InstrumentsInfo
  $ZhInstruments = $InstrumentsInfo
  "fitting" = $FittingInfo
  "fit" = $FittingInfo
  $ZhFitting = $FittingInfo
}

$SubTabAliases = @{
  "details" = $ZhDetails
  "detail" = $ZhDetails
  $ZhDetails = $ZhDetails
  "audiogram" = $ZhAudiogram
  "hearing chart" = $ZhAudiogram
  $ZhAudiogram = $ZhAudiogram
  "recd" = "RECD"
  "reug" = "REUG"
  "hearing instruments" = $ZhHearingInstrument
  "hearing instrument" = $ZhHearingInstrument
  "hearing aids" = $ZhHearingInstrument
  "hearing aid" = $ZhHearingInstrument
  $ZhHearingInstrument = $ZhHearingInstrument
  "acoustic parameters" = $ZhAcousticParameters
  "acoustics" = $ZhAcousticParameters
  $ZhAcousticParameters = $ZhAcousticParameters
  "accessories" = $ZhAccessory
  "accessory" = $ZhAccessory
  $ZhAccessory = $ZhAccessory
  "feedback" = $ZhFeedbackRealEar
  "feedback and real ear test" = $ZhFeedbackRealEar
  "feedback and real ear tests" = $ZhFeedbackRealEar
  "real ear test" = $ZhFeedbackRealEar
  $ZhFeedbackRealEar = $ZhFeedbackRealEar
  "coupling measurement" = $ZhCouplingMeasurement
  "real ear measurement" = $ZhCouplingMeasurement
  "real ear measurements" = $ZhCouplingMeasurement
  $ZhCouplingMeasurement = $ZhCouplingMeasurement
  "audiogramdirect" = $ZhInSitu
  "audiogram direct" = $ZhInSitu
  "in situ" = $ZhInSitu
  $ZhInSitu = $ZhInSitu
  "basic tuning" = $ZhBasicTuning
  "basic adjustment" = $ZhBasicTuning
  $ZhBasicTuning = $ZhBasicTuning
  "fine tuning" = $ZhFineTuning
  "fine adjustment" = $ZhFineTuning
  $ZhFineTuning = $ZhFineTuning
  "data save" = $ZhDataSave
  "data saving" = $ZhDataSave
  "data storage" = $ZhDataSave
  $ZhDataSave = $ZhDataSave
  "device options" = $ZhDeviceOptions
  $ZhDeviceOptions = $ZhDeviceOptions
}

function ConvertTo-UiaArray {
  param($Collection)
  $items = @()
  if ($null -eq $Collection) { return $items }
  for ($i = 0; $i -lt $Collection.Count; $i++) { $items += $Collection.Item($i) }
  $items
}

function New-UiaPropertyCondition {
  param($Property, $Value)
  New-Object System.Windows.Automation.PropertyCondition($Property, $Value)
}

function Find-UiaFirstByAutomationId {
  param($Root, [string]$AutomationId)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::AutomationIdProperty) `
    $AutomationId
  $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Find-TargetProcess {
  param([string]$TitlePattern, [int]$Timeout)
  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    $process = Get-Process -Name Target -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $_.MainWindowTitle -match $TitlePattern
      } |
      Select-Object -First 1

    if ($process) { return $process }
    Start-Sleep -Milliseconds 500
  } until ((Get-Date) -ge $deadline)

  throw "Target main window not found. Expected title pattern: $TitlePattern"
}

function Get-RootElement {
  param($TargetProcess)
  [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
}

function Get-SelectionState {
  param($Element)
  $selectionPattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionPattern)) {
    return $selectionPattern.Current.IsSelected
  }
  return $false
}

function Select-UiaElement {
  param($Element, [string]$Description)
  if (-not $Element) { throw "$Description not found." }

  $selectionPattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionPattern)) {
    $selectionPattern.Select()
    return "SelectionItemPattern"
  }

  $invokePattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) {
    $invokePattern.Invoke()
    return "InvokePattern"
  }

  throw "$Description does not support SelectionItemPattern or InvokePattern."
}

function Normalize-MainTab {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Provide -MainTab." }
  $key = $Value.Trim()
  $lower = $key.ToLowerInvariant()
  if ($MainTabMap.ContainsKey($key)) { return $MainTabMap[$key] }
  if ($MainTabMap.ContainsKey($lower)) { return $MainTabMap[$lower] }
  throw "Unsupported main tab: $Value. Allowed: Client, Instruments, Fitting."
}

function Normalize-SubTab {
  param([string]$Value, $MainTabInfo)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $key = $Value.Trim()
  $lower = $key.ToLowerInvariant()

  $normalized = $null
  if ($SubTabAliases.ContainsKey($key)) { $normalized = $SubTabAliases[$key] }
  elseif ($SubTabAliases.ContainsKey($lower)) { $normalized = $SubTabAliases[$lower] }
  else { $normalized = $key }

  if (-not ($MainTabInfo.SubTabs -contains $normalized)) {
    throw "Unsupported sub tab '$Value' for main tab $($MainTabInfo.Key)."
  }
  $normalized
}

function Get-TabItems {
  param($Root)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::TabItem)
  ConvertTo-UiaArray $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Find-SubTabItem {
  param($Root, [string]$Name)
  $matches = @(Get-TabItems $Root | Where-Object { $_.Current.Name -eq $Name })
  if ($matches.Count -eq 0) { return $null }
  $visibleMatches = @($matches | Where-Object {
      $rect = $_.Current.BoundingRectangle
      -not [double]::IsInfinity($rect.Left) -and
      -not [double]::IsNaN($rect.Left) -and
      $rect.Width -gt 20 -and
      $rect.Height -gt 10
    })
  if ($visibleMatches.Count -gt 0) {
    return $visibleMatches | Sort-Object { $_.Current.BoundingRectangle.Top }, { $_.Current.BoundingRectangle.Left } | Select-Object -First 1
  }
  $matches | Select-Object -First 1
}

function Write-AvailableTabSummary {
  "Client: $($ClientInfo.SubTabs -join ',')"
  "Instruments: $($InstrumentsInfo.SubTabs -join ',')"
  "Fitting: $($FittingInfo.SubTabs -join ',')"
}

if ($ListAvailable) {
  Write-AvailableTabSummary
  exit 0
}

$mainTabInfo = Normalize-MainTab $MainTab
$subTabName = Normalize-SubTab -Value $SubTab -MainTabInfo $mainTabInfo

$targetProcess = Find-TargetProcess -TitlePattern $TargetTitlePattern -Timeout $TimeoutSeconds
[void][PhonakTargetSwitchFittingTabWin32]::ShowWindow($targetProcess.MainWindowHandle, 9)
[void][PhonakTargetSwitchFittingTabWin32]::SetForegroundWindow($targetProcess.MainWindowHandle)
Start-Sleep -Milliseconds 500

$root = Get-RootElement $targetProcess
$mainTabItem = Find-UiaFirstByAutomationId $root $mainTabInfo.AutomationId
if (-not $mainTabItem) {
  throw "Fitting session main tab not found: $($mainTabInfo.AutomationId). Open a client fitting session first."
}

"Status=Starting"
"WindowTitle=$($targetProcess.MainWindowTitle)"
"MainTab=$($mainTabInfo.Key)"
"MainTabAutomationId=$($mainTabInfo.AutomationId)"
if ($subTabName) { "SubTab=$subTabName" }
"DryRun=$([bool]$DryRun)"

if ($DryRun) {
  "AvailableSubTabs=$($mainTabInfo.SubTabs -join ',')"
  "Status=DryRun"
  exit 0
}

$mainMethod = Select-UiaElement -Element $mainTabItem -Description "Main tab $($mainTabInfo.Key)"
Start-Sleep -Milliseconds 800

$root = Get-RootElement $targetProcess
$mainTabItem = Find-UiaFirstByAutomationId $root $mainTabInfo.AutomationId
if (-not (Get-SelectionState $mainTabItem)) {
  throw "Main tab verification failed: $($mainTabInfo.Key)"
}
"MainTabMethod=$mainMethod"
"Verify=MainTab Selected"

if ($subTabName) {
  $subTabItem = Find-SubTabItem -Root $root -Name $subTabName
  if (-not $subTabItem) {
    throw "Sub tab not found after selecting $($mainTabInfo.Key): $subTabName"
  }

  $subMethod = Select-UiaElement -Element $subTabItem -Description "Sub tab $subTabName"
  Start-Sleep -Milliseconds 800

  $root = Get-RootElement $targetProcess
  $subTabItem = Find-SubTabItem -Root $root -Name $subTabName
  if (-not $subTabItem -or -not (Get-SelectionState $subTabItem)) {
    throw "Sub tab verification failed: $subTabName"
  }
  "SubTabMethod=$subMethod"
  "Verify=SubTab Selected"
}

"Status=Set"
