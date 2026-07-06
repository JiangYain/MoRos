param(
  [string]$Consent,
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$TimeoutSeconds = 10,
  [switch]$DryRun,
  [switch]$GetOnly,
  [switch]$NoEnsureDetailsTab
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetClientConsentWin32 {
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

$ZhDetails = U 0x8BE6,0x60C5
$ZhYes = U 0x662F
$ZhNo = U 0x5426
$ZhAgree = U 0x540C,0x610F
$ZhDisagree = U 0x4E0D,0x540C,0x610F

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

function Find-SubTabItem {
  param($Root, [string]$Name)
  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::TabItem)
  $items = @(ConvertTo-UiaArray $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition))
  $matches = @($items | Where-Object { $_.Current.Name -eq $Name })
  if ($matches.Count -eq 0) { return $null }
  $matches |
    Where-Object {
      $rect = $_.Current.BoundingRectangle
      -not [double]::IsInfinity($rect.Left) -and
      $rect.Width -gt 20 -and
      $rect.Height -gt 10
    } |
    Sort-Object { $_.Current.BoundingRectangle.Top }, { $_.Current.BoundingRectangle.Left } |
    Select-Object -First 1
}

function Ensure-ClientDetailsTab {
  param($TargetProcess)

  $root = Get-RootElement $TargetProcess
  $clientTab = Find-UiaFirstByAutomationId $root "Fitting.ClientTabItem"
  if (-not $clientTab) {
    throw "Fitting.ClientTabItem not found. Open a client fitting session first."
  }

  [void](Select-UiaElement -Element $clientTab -Description "Client main tab")
  Start-Sleep -Milliseconds 700

  $root = Get-RootElement $TargetProcess
  $detailsTab = Find-SubTabItem -Root $root -Name $ZhDetails
  if (-not $detailsTab) {
    throw "Client details sub tab not found."
  }

  [void](Select-UiaElement -Element $detailsTab -Description "Client details sub tab")
  Start-Sleep -Milliseconds 700
}

function Normalize-Consent {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Provide -Consent Yes or -Consent No." }
  $key = $Value.Trim()
  $lower = $key.ToLowerInvariant()

  if (@("yes", "y", "true", "1", "enable", "enabled", "on", "agree", "consent", "datastorageon") -contains $lower) {
    return "Yes"
  }
  if (@("no", "n", "false", "0", "disable", "disabled", "off", "decline", "disagree", "datastorageoff") -contains $lower) {
    return "No"
  }
  if ($key -eq $ZhYes -or $key -eq $ZhAgree) { return "Yes" }
  if ($key -eq $ZhNo -or $key -eq $ZhDisagree) { return "No" }

  throw "Unsupported consent value: $Value. Allowed: Yes or No."
}

function Get-ConsentRadioButtons {
  param($Root)
  $yes = Find-UiaFirstByAutomationId $Root "YesRadioButton"
  $no = Find-UiaFirstByAutomationId $Root "NoRadioButton"
  if (-not $yes -or -not $no) {
    throw "Client consent radio buttons not found. Open the Client/Details page first."
  }
  @{
    Yes = $yes
    No = $no
  }
}

function Get-ConsentState {
  param($Buttons)
  $yesSelected = [bool](Get-SelectionState $Buttons.Yes)
  $noSelected = [bool](Get-SelectionState $Buttons.No)
  $value = "Unknown"
  if ($yesSelected) { $value = "Yes" }
  elseif ($noSelected) { $value = "No" }
  @{
    Value = $value
    YesSelected = $yesSelected
    NoSelected = $noSelected
  }
}

if (-not $GetOnly) {
  $targetConsent = Normalize-Consent $Consent
}

$targetProcess = Find-TargetProcess -TitlePattern $TargetTitlePattern -Timeout $TimeoutSeconds
[void][PhonakTargetClientConsentWin32]::ShowWindow($targetProcess.MainWindowHandle, 9)
[void][PhonakTargetClientConsentWin32]::SetForegroundWindow($targetProcess.MainWindowHandle)
Start-Sleep -Milliseconds 500

if (-not $NoEnsureDetailsTab) {
  Ensure-ClientDetailsTab -TargetProcess $targetProcess
}

$root = Get-RootElement $targetProcess
$buttons = Get-ConsentRadioButtons $root
$stateBefore = Get-ConsentState $buttons

"Status=Starting"
"WindowTitle=$($targetProcess.MainWindowTitle)"
"CurrentConsent=$($stateBefore.Value)"
"YesSelected=$($stateBefore.YesSelected)"
"NoSelected=$($stateBefore.NoSelected)"
if (-not $GetOnly) {
  "TargetConsent=$targetConsent"
  "DryRun=$([bool]$DryRun)"
}

if ($GetOnly) {
  "Status=Current"
  exit 0
}

if ($DryRun) {
  "Plan=Set Consent=$targetConsent"
  "Status=DryRun"
  exit 0
}

$targetButton = $buttons[$targetConsent]
if ([bool](Get-SelectionState $targetButton)) {
  "AlreadySet=Consent $targetConsent"
} else {
  $method = Select-UiaElement -Element $targetButton -Description "Client consent $targetConsent radio button"
  "SetMethod=$method"
}

Start-Sleep -Milliseconds 600
$root = Get-RootElement $targetProcess
$buttons = Get-ConsentRadioButtons $root
$stateAfter = Get-ConsentState $buttons

if ($stateAfter.Value -ne $targetConsent) {
  throw "Client consent verification failed. Expected=$targetConsent Actual=$($stateAfter.Value)"
}

"Verify=Consent $($stateAfter.Value)"
"Verify=YesSelected $($stateAfter.YesSelected)"
"Verify=NoSelected $($stateAfter.NoSelected)"
"Status=Set"
