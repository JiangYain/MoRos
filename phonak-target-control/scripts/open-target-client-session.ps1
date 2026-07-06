param(
  [string]$ClientNumber,
  [string]$LastName,
  [string]$FirstName,
  [string]$SessionText,
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetOpenSessionWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

function New-UiaPropertyCondition {
  param($Property, $Value)
  New-Object System.Windows.Automation.PropertyCondition($Property, $Value)
}

function ConvertTo-UiaArray {
  param($Collection)
  $items = @()
  if ($null -eq $Collection) { return $items }
  for ($i = 0; $i -lt $Collection.Count; $i++) { $items += $Collection.Item($i) }
  $items
}

function Find-UiaFirstByAutomationId {
  param($Root, [string]$AutomationId)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::AutomationIdProperty) `
    $AutomationId
  $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Find-UiaChildrenByType {
  param($Root, $ControlType)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    $ControlType
  ConvertTo-UiaArray $Root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
}

function Find-UiaDescendantTexts {
  param($Element)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::Text)
  $texts = ConvertTo-UiaArray $Element.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  @($texts | ForEach-Object { $_.Current.Name } | Where-Object { $_ })
}

function Invoke-UiaElement {
  param($Element, [string]$Description)
  if (-not $Element) { throw "$Description not found." }
  $invokePattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) {
    $invokePattern.Invoke()
    return "InvokePattern"
  }
  $selectionPattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionPattern)) {
    $selectionPattern.Select()
    return "SelectionItemPattern"
  }
  throw "$Description does not support InvokePattern or SelectionItemPattern."
}

function Select-UiaDataItem {
  param($Element)
  $selectionPattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionPattern)) {
    $selectionPattern.Select()
    return "SelectionItemPattern"
  }
  throw "Data item does not support SelectionItemPattern."
}

function DoubleClick-UiaElement {
  param($Element)
  $rect = $Element.Current.BoundingRectangle
  $x = [int]($rect.Left + [Math]::Min(80, [Math]::Max(10, $rect.Width / 2)))
  $y = [int]($rect.Top + ($rect.Height / 2))
  [void][PhonakTargetOpenSessionWin32]::SetCursorPos($x, $y)
  foreach ($i in 1..2) {
    [PhonakTargetOpenSessionWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [PhonakTargetOpenSessionWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 120
  }
  "$x,$y"
}

function Get-TargetMainWindowProcess {
  param([string]$TitlePattern)
  Get-Process -Name Target -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -match $TitlePattern
    } |
    Select-Object -First 1
}

function Wait-TargetMainWindowProcess {
  param([string]$TitlePattern, [int]$Timeout)
  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    $process = Get-TargetMainWindowProcess -TitlePattern $TitlePattern
    if ($process) { return $process }
    Start-Sleep -Milliseconds 500
  } until ((Get-Date) -ge $deadline)
  throw "Phonak Target main window not found. Expected title pattern: $TitlePattern"
}

function Open-ClientsAndSessionsPage {
  param($TargetProcess)
  [void][PhonakTargetOpenSessionWin32]::ShowWindow($TargetProcess.MainWindowHandle, 9)
  [void][PhonakTargetOpenSessionWin32]::SetForegroundWindow($TargetProcess.MainWindowHandle)
  Start-Sleep -Milliseconds 500

  $root = [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
  $homeTab = Find-UiaFirstByAutomationId $root "Home.HomeTabControl"
  if (-not $homeTab) {
    throw "Home.HomeTabControl not found. If a fitting session is already open, close it before opening a different client/session."
  }

  $bottomTabs = @(
    Find-UiaChildrenByType $homeTab ([System.Windows.Automation.ControlType]::TabItem) |
      Sort-Object { $_.Current.BoundingRectangle.Left }
  )
  if ($bottomTabs.Count -lt 1) { throw "Home bottom tabs not found." }

  [void](Invoke-UiaElement $bottomTabs[0] "Clients & sessions tab")
  Start-Sleep -Milliseconds 800
  [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
}

function Ensure-PatientListVisible {
  param($Root)
  $list = Find-UiaFirstByAutomationId $Root "Home.PatientManagement.PatientListView"
  if ($list) { return $list }

  $showAll = Find-UiaFirstByAutomationId $Root "Home.PatientManagement.ShowAllButton"
  if (-not $showAll) {
    $showAll = Find-UiaFirstByAutomationId $Root "Home.PatientManagement.PatientList.ShowAllButton"
  }
  [void](Invoke-UiaElement $showAll "Show all button")
  Start-Sleep -Milliseconds 1200
  $list = Find-UiaFirstByAutomationId $Root "Home.PatientManagement.PatientListView"
  if (-not $list) { throw "PatientListView not found after Show all." }
  $list
}

function Get-PatientListItems {
  param($List)
  ConvertTo-UiaArray $List.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
  ) | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::DataItem
  }
}

function Test-PatientMatch {
  param([string[]]$Texts)
  if ($ClientNumber -and -not ($Texts -contains $ClientNumber)) { return $false }
  if ($LastName -and -not ($Texts -contains $LastName)) { return $false }
  if ($FirstName -and -not ($Texts -contains $FirstName)) { return $false }
  $true
}

if (-not $ClientNumber -and -not $LastName -and -not $FirstName) {
  throw "Provide at least one selector: -ClientNumber, -LastName, or -FirstName."
}

$targetProcess = Wait-TargetMainWindowProcess -TitlePattern $TargetTitlePattern -Timeout $TimeoutSeconds
$currentRoot = [System.Windows.Automation.AutomationElement]::FromHandle($targetProcess.MainWindowHandle)
$currentHomeTab = Find-UiaFirstByAutomationId $currentRoot "Home.HomeTabControl"
if (-not $currentHomeTab) {
  $currentTexts = @(Find-UiaDescendantTexts $currentRoot)
  $currentTextBlob = $currentTexts -join " "
  $matchesCurrentClient = $true
  if ($LastName -and $currentTextBlob -notmatch [regex]::Escape($LastName)) { $matchesCurrentClient = $false }
  if ($FirstName -and $currentTextBlob -notmatch [regex]::Escape($FirstName)) { $matchesCurrentClient = $false }
  if ($ClientNumber -and $currentTextBlob -notmatch [regex]::Escape($ClientNumber)) { $matchesCurrentClient = $false }

  if ($matchesCurrentClient) {
    "Status=AlreadyInSession"
    "Method=CurrentSessionDetected"
    "WindowTitle=$($targetProcess.MainWindowTitle)"
    "MatchedTextsAfter=$((@($currentTexts | Where-Object { $_ -match '顾客视图|验配|连接|界面|Fitting|Session|Zheng|Chord|客户|顾客' } | Select-Object -Unique)) -join '|')"
    exit 0
  }
}
$root = Open-ClientsAndSessionsPage -TargetProcess $targetProcess
$list = Ensure-PatientListVisible $root
$items = @(Get-PatientListItems $list)

$patientIndex = -1
$patientItem = $null
$patientTexts = @()
for ($i = 0; $i -lt $items.Count; $i++) {
  $texts = @(Find-UiaDescendantTexts $items[$i])
  if (($items[$i].Current.Name -match "PatientInfo") -and (Test-PatientMatch $texts)) {
    $patientIndex = $i
    $patientItem = $items[$i]
    $patientTexts = $texts
    break
  }
}

if (-not $patientItem) {
  throw "Patient row not found. ClientNumber=$ClientNumber LastName=$LastName FirstName=$FirstName"
}

[void](Select-UiaDataItem $patientItem)
Start-Sleep -Milliseconds 800

$root = [System.Windows.Automation.AutomationElement]::FromHandle($targetProcess.MainWindowHandle)
$openButton = Find-UiaFirstByAutomationId $root "Home.PatientManagement.OpenSessionButton"
if (-not $openButton) { throw "OpenSessionButton not found." }

$sessionItem = $null
$sessionTexts = @()
for ($i = $patientIndex + 1; $i -lt $items.Count; $i++) {
  if ($items[$i].Current.Name -match "PatientInfo") { break }
  if ($items[$i].Current.Name -match "SessionInfo") {
    $texts = @(Find-UiaDescendantTexts $items[$i])
    if (-not $SessionText -or (($texts -join " ") -match [regex]::Escape($SessionText))) {
      $sessionItem = $items[$i]
      $sessionTexts = $texts
      break
    }
  }
}

if ($sessionItem) {
  [void](Select-UiaDataItem $sessionItem)
  Start-Sleep -Milliseconds 500
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($targetProcess.MainWindowHandle)
  $openButton = Find-UiaFirstByAutomationId $root "Home.PatientManagement.OpenSessionButton"
  if (-not $openButton.Current.IsEnabled) {
    throw "Session row was selected, but OpenSessionButton is disabled."
  }
  [void](Invoke-UiaElement $openButton "Open session button")
  $method = "OpenSessionButton"
} else {
  $clickPoint = DoubleClick-UiaElement $patientItem
  $method = "DoubleClickPatientRow"
}

Start-Sleep -Seconds 3
$root = [System.Windows.Automation.AutomationElement]::FromHandle($targetProcess.MainWindowHandle)
$descendants = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$textsAfter = @()
for ($i = 0; $i -lt $descendants.Count; $i++) {
  $element = $descendants.Item($i)
  if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -and $element.Current.Name) {
    $textsAfter += $element.Current.Name
  }
}

"Status=OpenInvoked"
"Method=$method"
"PatientTexts=$($patientTexts -join '|')"
if ($sessionTexts.Count -gt 0) { "SessionTexts=$($sessionTexts -join '|')" }
if ($clickPoint) { "ClickPoint=$clickPoint" }
"WindowTitle=$($targetProcess.MainWindowTitle)"
"MatchedTextsAfter=$((@($textsAfter | Where-Object { $_ -match '顾客视图|验配|连接|界面|Fitting|Session|Zheng|Chord|客户|顾客' } | Select-Object -Unique)) -join '|')"
