param(
  [string]$LeftAc,
  [string]$RightAc,
  [string]$LeftBc,
  [string]$RightBc,
  [string]$LeftUcl,
  [string]$RightUcl,
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$TimeoutSeconds = 10,
  [switch]$DryRun,
  [switch]$Precheck
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetAudiogramWin32 {
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

$FrequencyRatios = @{
  125 = 0.095
  250 = 0.210
  500 = 0.341
  750 = 0.433
  1000 = 0.499
  1500 = 0.591
  2000 = 0.656
  3000 = 0.735
  4000 = 0.814
  6000 = 0.892
  8000 = 0.946
}

$DbRatios = @{
  0 = 0.102
  5 = 0.129
  10 = 0.155
  15 = 0.207
  20 = 0.234
  25 = 0.260
  30 = 0.312
  35 = 0.339
  40 = 0.365
  45 = 0.391
  50 = 0.444
  55 = 0.470
  60 = 0.496
  65 = 0.522
  70 = 0.575
  75 = 0.601
  80 = 0.627
  85 = 0.654
  90 = 0.706
  95 = 0.732
  100 = 0.759
  105 = 0.785
  110 = 0.837
  115 = 0.864
  120 = 0.890
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

function Get-ElementCenterX {
  param($Element)
  $rect = $Element.Current.BoundingRectangle
  $rect.Left + ($rect.Width / 2.0)
}

function Find-ClosestGraphByX {
  param([object[]]$Graphs, [double]$CenterX)
  $best = $null
  $bestDistance = [double]::PositiveInfinity
  foreach ($graph in $Graphs) {
    $distance = [Math]::Abs((Get-ElementCenterX $graph) - $CenterX)
    if ($distance -lt $bestDistance) {
      $best = $graph
      $bestDistance = $distance
    }
  }
  $best
}

function Get-GraphByEar {
  param($Root, [object[]]$Graphs, [string]$Ear)

  $expanderId = "Fitting.PatientArea.Audiogram.TinnitusExpander$Ear"
  $expander = Find-UiaFirstByAutomationId $Root $expanderId
  if ($expander) {
    return Find-ClosestGraphByX -Graphs $Graphs -CenterX (Get-ElementCenterX $expander)
  }

  $sorted = @($Graphs | Sort-Object { $_.Current.BoundingRectangle.Left })
  if ($Ear -eq "Right") {
    return $sorted[0]
  }
  return $sorted[$sorted.Count - 1]
}

function Select-AudiogramMode {
  param($Root, [string]$Mode)

  $automationIds = @{
    AC = "Fitting.PatientArea.Audiogram.AcRadioButton"
    BC = "Fitting.PatientArea.Audiogram.BcRadioButton"
    UCL = "Fitting.PatientArea.Audiogram.UclRadioButton"
  }

  if (-not $automationIds.ContainsKey($Mode)) {
    throw "Unsupported audiogram mode: $Mode"
  }

  $button = Find-UiaFirstByAutomationId $Root $automationIds[$Mode]
  if (-not $button) { throw "$Mode radio button not found." }

  $selectionPattern = $null
  if ($button.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionPattern)) {
    $selectionPattern.Select()
    Start-Sleep -Milliseconds 150
    return
  }

  $invokePattern = $null
  if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) {
    $invokePattern.Invoke()
    Start-Sleep -Milliseconds 150
    return
  }

  throw "$Mode radio button does not support SelectionItemPattern or InvokePattern."
}

function Normalize-Frequency {
  param([string]$Raw)

  $value = $Raw.Trim().ToLowerInvariant()
  $value = $value -replace "hz$", ""
  if ($value.EndsWith("k")) {
    $number = [double]::Parse($value.Substring(0, $value.Length - 1), [Globalization.CultureInfo]::InvariantCulture)
    return [int]($number * 1000)
  }

  [int][double]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
}

function Parse-AudiogramSpec {
  param([string]$Spec, [string]$Label)

  $result = @{}
  if ([string]::IsNullOrWhiteSpace($Spec)) { return $result }

  $pairs = @($Spec -split "[,; ]+" | Where-Object { $_ -and $_.Trim() })
  foreach ($pair in $pairs) {
    if ($pair -notmatch "^\s*([^:=]+)\s*[:=]\s*(-?\d+)\s*$") {
      throw "Invalid $($Label) pair '$pair'. Use '<frequency>=<dB>' pairs separated by comma, semicolon, or space."
    }

    $frequency = Normalize-Frequency $matches[1]
    $db = [int]$matches[2]

    if (-not $FrequencyRatios.ContainsKey($frequency)) {
      throw "Unsupported frequency for $($Label): $frequency. Supported: $((@($FrequencyRatios.Keys) | Sort-Object {[int]$_}) -join ',')."
    }
    if (-not $DbRatios.ContainsKey($db)) {
      throw "Unsupported dB for $($Label) at ${frequency}Hz: $db. Use 0..120 in 5 dB steps."
    }

    $result[$frequency] = $db
  }

  $result
}

function Get-ClickPoint {
  param($Graph, [int]$Frequency, [int]$Db)
  $rect = $Graph.Current.BoundingRectangle
  [pscustomobject]@{
    X = [int][Math]::Round($rect.Left + ($rect.Width * [double]$FrequencyRatios[$Frequency]))
    Y = [int][Math]::Round($rect.Top + ($rect.Height * [double]$DbRatios[$Db]))
    Frequency = $Frequency
    Db = $Db
    GraphLeft = [int]$rect.Left
    GraphTop = [int]$rect.Top
    GraphWidth = [int]$rect.Width
    GraphHeight = [int]$rect.Height
  }
}

function Read-HoverText {
  param($Root)
  $all = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $names = @()
  for ($i = 0; $i -lt $all.Count; $i++) {
    $element = $all.Item($i)
    if (
      $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -and
      $element.Current.Name -match "^[0-9\.]+k?Hz, -?[0-9]+dB$"
    ) {
      $names += $element.Current.Name
    }
  }
  @($names | Select-Object -Unique | Select-Object -Last 1)[0]
}

function Convert-FrequencyToHoverLabel {
  param([int]$Frequency)
  "${Frequency}Hz"
}

function Test-HoverPoint {
  param($Root, $Point)
  [void][PhonakTargetAudiogramWin32]::SetCursorPos($Point.X, $Point.Y)
  Start-Sleep -Milliseconds 250
  $hover = Read-HoverText $Root
  if ([string]::IsNullOrWhiteSpace($hover)) {
    return [pscustomobject]@{ Status = "NoHoverText"; Hover = "" }
  }

  $expected = "$(Convert-FrequencyToHoverLabel $Point.Frequency), $($Point.Db)dB"
  if ($hover -ne $expected) {
    return [pscustomobject]@{ Status = "Mismatch"; Hover = $hover; Expected = $expected }
  }

  [pscustomobject]@{ Status = "Matched"; Hover = $hover; Expected = $expected }
}

function Click-Point {
  param($Point)
  [void][PhonakTargetAudiogramWin32]::SetCursorPos($Point.X, $Point.Y)
  [PhonakTargetAudiogramWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [PhonakTargetAudiogramWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 450
}

function Get-GraphValueXml {
  param($Graph)
  $valuePattern = $null
  if (-not $Graph.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
    throw "AudiogramControl does not expose ValuePattern."
  }
  $valuePattern.Current.Value
}

function Get-CouplingPointsFromXml {
  param([string]$XmlText, [string]$Coupling)
  $points = @{}
  if ([string]::IsNullOrWhiteSpace($XmlText)) { return $points }

  $nodesByCoupling = @{
    AC = "AirCouplingData"
    BC = "BoneCouplingData"
    UCL = "UncomfortableLevelData"
  }

  if (-not $nodesByCoupling.ContainsKey($Coupling)) {
    throw "Unsupported coupling for XML read: $Coupling"
  }

  [xml]$xml = $XmlText
  $nodes = $xml.SelectNodes("/GraphControl/Coordinates/$($nodesByCoupling[$Coupling])/Point")
  foreach ($node in $nodes) {
    $points[[int]$node.X] = [int]$node.Y
  }
  $points
}

function Set-EarAudiogram {
  param(
    [string]$Ear,
    [string]$Mode,
    $Graph,
    [hashtable]$Points,
    $Root,
    [switch]$DryRun,
    [switch]$Precheck
  )

  if ($Points.Count -eq 0) { return }

  $planned = @()
  foreach ($frequency in @($Points.Keys | Sort-Object {[int]$_})) {
    $planned += Get-ClickPoint -Graph $Graph -Frequency ([int]$frequency) -Db ([int]$Points[$frequency])
  }

  foreach ($point in $planned) {
    "Plan=$Ear $Mode $($point.Frequency)Hz=$($point.Db)dB Click=$($point.X),$($point.Y)"
  }

  if ($DryRun) {
    return
  }

  foreach ($point in $planned) {
    if ($Precheck) {
      $check = Test-HoverPoint -Root $Root -Point $point
      "Precheck=$Ear $Mode $($point.Frequency)Hz $($point.Db)dB Status=$($check.Status) Hover=$($check.Hover)"
      if ($check.Status -eq "Mismatch") {
        [Console]::WriteLine("PrecheckWarning=$Ear $Mode $($point.Frequency)Hz $($point.Db)dB Hover=$($check.Hover) Expected=$($check.Expected)")
      }
    }

    Click-Point $point
  }
}

function Test-RequestedPoints {
  param([string]$Ear, [string]$Mode, [hashtable]$Requested, [hashtable]$Actual)

  $missing = @()
  foreach ($frequency in @($Requested.Keys | Sort-Object {[int]$_})) {
    $expectedDb = [int]$Requested[$frequency]
    if (-not $Actual.ContainsKey([int]$frequency) -or [int]$Actual[[int]$frequency] -ne $expectedDb) {
      $actualText = "<missing>"
      if ($Actual.ContainsKey([int]$frequency)) { $actualText = [string]$Actual[[int]$frequency] }
      $missing += "${frequency}Hz expected $expectedDb actual $actualText"
    }
  }

  $unrequested = @()
  foreach ($frequency in @($Actual.Keys | Sort-Object {[int]$_})) {
    if (-not $Requested.ContainsKey([int]$frequency)) {
      $unrequested += "${frequency}Hz=$($Actual[[int]$frequency])"
    }
  }

  [Console]::WriteLine("Verify=$Ear $Mode Requested=$($Requested.Count) ActualPoints=$($Actual.Count)")
  if ($missing.Count -gt 0) {
    [Console]::WriteLine("MissingOrDifferent=$Ear $Mode $($missing -join '; ')")
    return $false
  }
  if ($unrequested.Count -gt 0) {
    [Console]::WriteLine("UnspecifiedExisting=$Ear $Mode $($unrequested -join ',')")
  }
  $true
}

$leftAcPoints = Parse-AudiogramSpec -Spec $LeftAc -Label "LeftAc"
$rightAcPoints = Parse-AudiogramSpec -Spec $RightAc -Label "RightAc"
$leftBcPoints = Parse-AudiogramSpec -Spec $LeftBc -Label "LeftBc"
$rightBcPoints = Parse-AudiogramSpec -Spec $RightBc -Label "RightBc"
$leftUclPoints = Parse-AudiogramSpec -Spec $LeftUcl -Label "LeftUcl"
$rightUclPoints = Parse-AudiogramSpec -Spec $RightUcl -Label "RightUcl"

if (
  $leftAcPoints.Count -eq 0 -and
  $rightAcPoints.Count -eq 0 -and
  $leftBcPoints.Count -eq 0 -and
  $rightBcPoints.Count -eq 0 -and
  $leftUclPoints.Count -eq 0 -and
  $rightUclPoints.Count -eq 0
) {
  throw "Provide at least one of -LeftAc, -RightAc, -LeftBc, -RightBc, -LeftUcl, or -RightUcl."
}

$targetProcess = Find-TargetProcess -TitlePattern $TargetTitlePattern -Timeout $TimeoutSeconds
[void][PhonakTargetAudiogramWin32]::ShowWindow($targetProcess.MainWindowHandle, 9)
[void][PhonakTargetAudiogramWin32]::SetForegroundWindow($targetProcess.MainWindowHandle)
Start-Sleep -Milliseconds 500

$root = Get-RootElement $targetProcess
$graphs = Get-AudiogramGraphs $root
$leftGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Left"
$rightGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Right"

"Status=Starting"
"WindowTitle=$($targetProcess.MainWindowTitle)"
"LeftAcCount=$($leftAcPoints.Count)"
"RightAcCount=$($rightAcPoints.Count)"
"LeftBcCount=$($leftBcPoints.Count)"
"RightBcCount=$($rightBcPoints.Count)"
"LeftUclCount=$($leftUclPoints.Count)"
"RightUclCount=$($rightUclPoints.Count)"
"DryRun=$([bool]$DryRun)"
"Precheck=$([bool]$Precheck)"

if ($leftAcPoints.Count -gt 0 -or $rightAcPoints.Count -gt 0) {
  Select-AudiogramMode -Root $root -Mode "AC"
  Set-EarAudiogram -Ear "Left" -Mode "AC" -Graph $leftGraph -Points $leftAcPoints -Root $root -DryRun:$DryRun -Precheck:$Precheck
  Set-EarAudiogram -Ear "Right" -Mode "AC" -Graph $rightGraph -Points $rightAcPoints -Root $root -DryRun:$DryRun -Precheck:$Precheck
}

if ($leftBcPoints.Count -gt 0 -or $rightBcPoints.Count -gt 0) {
  Select-AudiogramMode -Root $root -Mode "BC"
  Set-EarAudiogram -Ear "Left" -Mode "BC" -Graph $leftGraph -Points $leftBcPoints -Root $root -DryRun:$DryRun -Precheck:$Precheck
  Set-EarAudiogram -Ear "Right" -Mode "BC" -Graph $rightGraph -Points $rightBcPoints -Root $root -DryRun:$DryRun -Precheck:$Precheck
}

if ($leftUclPoints.Count -gt 0 -or $rightUclPoints.Count -gt 0) {
  Select-AudiogramMode -Root $root -Mode "UCL"
  Set-EarAudiogram -Ear "Left" -Mode "UCL" -Graph $leftGraph -Points $leftUclPoints -Root $root -DryRun:$DryRun -Precheck:$Precheck
  Set-EarAudiogram -Ear "Right" -Mode "UCL" -Graph $rightGraph -Points $rightUclPoints -Root $root -DryRun:$DryRun -Precheck:$Precheck
}

if ($DryRun) {
  "Status=DryRun"
  exit 0
}

Start-Sleep -Milliseconds 700
$root = Get-RootElement $targetProcess
$graphs = Get-AudiogramGraphs $root
$leftGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Left"
$rightGraph = Get-GraphByEar -Root $root -Graphs $graphs -Ear "Right"

$leftXml = Get-GraphValueXml $leftGraph
$rightXml = Get-GraphValueXml $rightGraph
$leftAcActual = Get-CouplingPointsFromXml -XmlText $leftXml -Coupling "AC"
$rightAcActual = Get-CouplingPointsFromXml -XmlText $rightXml -Coupling "AC"
$leftBcActual = Get-CouplingPointsFromXml -XmlText $leftXml -Coupling "BC"
$rightBcActual = Get-CouplingPointsFromXml -XmlText $rightXml -Coupling "BC"
$leftUclActual = Get-CouplingPointsFromXml -XmlText $leftXml -Coupling "UCL"
$rightUclActual = Get-CouplingPointsFromXml -XmlText $rightXml -Coupling "UCL"

$ok = $true
if ($leftAcPoints.Count -gt 0) {
  $ok = (Test-RequestedPoints -Ear "Left" -Mode "AC" -Requested $leftAcPoints -Actual $leftAcActual) -and $ok
}
if ($rightAcPoints.Count -gt 0) {
  $ok = (Test-RequestedPoints -Ear "Right" -Mode "AC" -Requested $rightAcPoints -Actual $rightAcActual) -and $ok
}
if ($leftBcPoints.Count -gt 0) {
  $ok = (Test-RequestedPoints -Ear "Left" -Mode "BC" -Requested $leftBcPoints -Actual $leftBcActual) -and $ok
}
if ($rightBcPoints.Count -gt 0) {
  $ok = (Test-RequestedPoints -Ear "Right" -Mode "BC" -Requested $rightBcPoints -Actual $rightBcActual) -and $ok
}
if ($leftUclPoints.Count -gt 0) {
  $ok = (Test-RequestedPoints -Ear "Left" -Mode "UCL" -Requested $leftUclPoints -Actual $leftUclActual) -and $ok
}
if ($rightUclPoints.Count -gt 0) {
  $ok = (Test-RequestedPoints -Ear "Right" -Mode "UCL" -Requested $rightUclPoints -Actual $rightUclActual) -and $ok
}

"LeftGraphXml=$leftXml"
"RightGraphXml=$rightXml"

if (-not $ok) {
  throw "Audiogram verification failed."
}

"Status=Set"
