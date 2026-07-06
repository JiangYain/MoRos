param(
  [string]$LeftCondition,
  [string]$RightCondition,
  [string]$BothCondition,
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

public class PhonakTargetAudiogramConditionWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$AllowedConditions = @("Tdh", "ER3", "ER3Custom", "LS0", "LS45", "LS90")
$ConditionAliases = @{
  "tdh" = "Tdh"
  "headphone" = "Tdh"
  "headphones" = "Tdh"
  "headset" = "Tdh"
  "头带耳机" = "Tdh"
  "頭帶耳機" = "Tdh"
  "er3" = "ER3"
  "insert" = "ER3"
  "insert earphone" = "ER3"
  "insert earphones" = "ER3"
  "插入耳机" = "ER3"
  "插入耳機" = "ER3"
  "er3custom" = "ER3Custom"
  "er3 custom" = "ER3Custom"
  "ls0" = "LS0"
  "ls45" = "LS45"
  "ls90" = "LS90"
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

function Get-ElementCenterX {
  param($Element)
  $rect = $Element.Current.BoundingRectangle
  $rect.Left + ($rect.Width / 2.0)
}

function Find-ClosestByX {
  param([object[]]$Elements, [double]$CenterX)
  $best = $null
  $bestDistance = [double]::PositiveInfinity
  foreach ($element in $Elements) {
    $distance = [Math]::Abs((Get-ElementCenterX $element) - $CenterX)
    if ($distance -lt $bestDistance) {
      $best = $element
      $bestDistance = $distance
    }
  }
  $best
}

function Get-AudiogramGraphs {
  param($Root)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ClassNameProperty) `
    "AudiogramControl"
  $graphs = @(ConvertTo-UiaArray $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition))
  if ($graphs.Count -lt 2) {
    throw "Expected two AudiogramControl elements. Open the fitting audiogram page first."
  }
  $graphs
}

function Get-GraphByEar {
  param($Root, [object[]]$Graphs, [string]$Ear)

  $expander = Find-UiaFirstByAutomationId $Root "Fitting.PatientArea.Audiogram.TinnitusExpander$Ear"
  if ($expander) {
    return Find-ClosestByX -Elements $Graphs -CenterX (Get-ElementCenterX $expander)
  }

  $sorted = @($Graphs | Sort-Object { $_.Current.BoundingRectangle.Left })
  if ($Ear -eq "Right") { return $sorted[0] }
  $sorted[$sorted.Count - 1]
}

function Get-AudiogramConditionComboboxes {
  param($Root, [object[]]$Graphs)

  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::ComboBox)
  $boxes = @(ConvertTo-UiaArray $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition))

  $candidates = @()
  foreach ($box in $boxes) {
    $rect = $box.Current.BoundingRectangle
    if (
      $box.Current.AutomationId -eq "" -and
      -not [double]::IsInfinity($rect.Left) -and
      -not [double]::IsNaN($rect.Left)
    ) {
      foreach ($graph in $Graphs) {
        $graphRect = $graph.Current.BoundingRectangle
        $belowGraph = $rect.Top -ge ($graphRect.Bottom + 5) -and $rect.Top -le ($graphRect.Bottom + 90)
        $nearGraph = (Get-ElementCenterX $box) -ge $graphRect.Left -and (Get-ElementCenterX $box) -le $graphRect.Right
        if ($belowGraph -and $nearGraph) {
          $candidates += $box
          break
        }
      }
    }
  }

  $unique = @()
  foreach ($candidate in $candidates) {
    $exists = $false
    foreach ($item in $unique) {
      $r1 = $candidate.Current.BoundingRectangle
      $r2 = $item.Current.BoundingRectangle
      if ([Math]::Abs($r1.Left - $r2.Left) -lt 2 -and [Math]::Abs($r1.Top - $r2.Top) -lt 2) {
        $exists = $true
        break
      }
    }
    if (-not $exists) { $unique += $candidate }
  }

  if ($unique.Count -lt 2) {
    throw "Expected two audiogram condition ComboBox elements under the graphs."
  }

  $unique
}

function Get-ComboSelection {
  param($ComboBox)
  $selectionPattern = $null
  if (-not $ComboBox.TryGetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern, [ref]$selectionPattern)) {
    return ""
  }
  $selected = $selectionPattern.Current.GetSelection()
  $names = @()
  for ($i = 0; $i -lt $selected.Count; $i++) {
    if ($selected.Item($i).Current.Name) { $names += $selected.Item($i).Current.Name }
  }
  $names -join "|"
}

function Normalize-Condition {
  param([string]$Condition)
  if ([string]::IsNullOrWhiteSpace($Condition)) { return "" }
  $key = $Condition.Trim()
  if ($AllowedConditions -contains $key) { return $key }
  $lower = $key.ToLowerInvariant()
  if ($ConditionAliases.ContainsKey($lower)) { return $ConditionAliases[$lower] }
  throw "Unsupported audiogram condition: $Condition. Allowed: $($AllowedConditions -join ',')"
}

function Select-ComboItemByName {
  param($Root, $ComboBox, [string]$ItemName)

  $expandPattern = $null
  if (-not $ComboBox.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$expandPattern)) {
    throw "Audiogram condition ComboBox does not expose ExpandCollapsePattern."
  }

  $expandPattern.Expand()
  Start-Sleep -Milliseconds 350

  $itemCondition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::ListItem)
  $items = @(ConvertTo-UiaArray $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCondition))

  $targetItem = $null
  foreach ($item in $items) {
    if ($item.Current.Name -eq $ItemName) {
      $selectionItemPattern = $null
      if ($item.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionItemPattern)) {
        $targetItem = $item
        break
      }
    }
  }

  if (-not $targetItem) {
    try { $expandPattern.Collapse() } catch {}
    throw "Condition option not found in expanded ComboBox: $ItemName"
  }

  $targetSelectionPattern = $targetItem.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
  $targetSelectionPattern.Select()
  Start-Sleep -Milliseconds 500
}

function Set-EarCondition {
  param(
    [string]$Ear,
    $ComboBox,
    [string]$Condition,
    $Root,
    [switch]$DryRun
  )

  if ([string]::IsNullOrWhiteSpace($Condition)) { return }

  $current = Get-ComboSelection $ComboBox
  $rect = $ComboBox.Current.BoundingRectangle
  "Plan=$Ear Condition=$Condition Current=$current ComboRect=$([int]$rect.Left),$([int]$rect.Top),$([int]$rect.Width),$([int]$rect.Height)"

  if ($DryRun) { return }
  if ($current -eq $Condition) {
    "AlreadySet=$Ear Condition=$Condition"
    return
  }

  Select-ComboItemByName -Root $Root -ComboBox $ComboBox -ItemName $Condition
}

if ($ListAvailable) {
  "AvailableConditions=$($AllowedConditions -join ',')"
  exit 0
}

if ($BothCondition) {
  $LeftCondition = $BothCondition
  $RightCondition = $BothCondition
}

$LeftCondition = Normalize-Condition $LeftCondition
$RightCondition = Normalize-Condition $RightCondition

if ([string]::IsNullOrWhiteSpace($LeftCondition) -and [string]::IsNullOrWhiteSpace($RightCondition)) {
  throw "Provide -LeftCondition, -RightCondition, or -BothCondition."
}

$targetProcess = Find-TargetProcess -TitlePattern $TargetTitlePattern -Timeout $TimeoutSeconds
[void][PhonakTargetAudiogramConditionWin32]::ShowWindow($targetProcess.MainWindowHandle, 9)
[void][PhonakTargetAudiogramConditionWin32]::SetForegroundWindow($targetProcess.MainWindowHandle)
Start-Sleep -Milliseconds 500

$root = Get-RootElement $targetProcess
$graphs = Get-AudiogramGraphs $root
$leftGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Left"
$rightGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Right"
$conditionBoxes = Get-AudiogramConditionComboboxes -Root $root -Graphs $graphs
$leftCombo = Find-ClosestByX -Elements $conditionBoxes -CenterX (Get-ElementCenterX $leftGraph)
$rightCombo = Find-ClosestByX -Elements $conditionBoxes -CenterX (Get-ElementCenterX $rightGraph)

"Status=Starting"
"WindowTitle=$($targetProcess.MainWindowTitle)"
"LeftCondition=$LeftCondition"
"RightCondition=$RightCondition"
"DryRun=$([bool]$DryRun)"

Set-EarCondition -Ear "Left" -ComboBox $leftCombo -Condition $LeftCondition -Root $root -DryRun:$DryRun
Set-EarCondition -Ear "Right" -ComboBox $rightCombo -Condition $RightCondition -Root $root -DryRun:$DryRun

if ($DryRun) {
  "Status=DryRun"
  exit 0
}

Start-Sleep -Milliseconds 700
$root = Get-RootElement $targetProcess
$graphs = Get-AudiogramGraphs $root
$conditionBoxes = Get-AudiogramConditionComboboxes -Root $root -Graphs $graphs
$leftGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Left"
$rightGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Right"
$leftCombo = Find-ClosestByX -Elements $conditionBoxes -CenterX (Get-ElementCenterX $leftGraph)
$rightCombo = Find-ClosestByX -Elements $conditionBoxes -CenterX (Get-ElementCenterX $rightGraph)
$leftAfter = Get-ComboSelection $leftCombo
$rightAfter = Get-ComboSelection $rightCombo

if ($LeftCondition -and $leftAfter -ne $LeftCondition) {
  throw "Left condition verification failed. Expected=$LeftCondition Actual=$leftAfter"
}
if ($RightCondition -and $rightAfter -ne $RightCondition) {
  throw "Right condition verification failed. Expected=$RightCondition Actual=$rightAfter"
}

"Verify=Left Condition=$leftAfter"
"Verify=Right Condition=$rightAfter"
"Status=Set"
