param(
  [Parameter(Mandatory = $true)]
  [string]$LastName,

  [Parameter(Mandatory = $true)]
  [string]$FirstName,

  [ValidateSet("Female", "Male", "Other")]
  [string]$Gender,

  [string]$BirthDate,
  [string]$Address1,
  [string]$Address2,
  [string]$PostalCode,
  [string]$City,
  [string]$Email,
  [string]$PhoneHome,
  [string]$PhoneBusiness,
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$TimeoutSeconds = 20,
  [switch]$Save,
  [switch]$CancelAfterFill
)

$ErrorActionPreference = "Stop"

if ($Save -and $CancelAfterFill) {
  throw "Use either -Save or -CancelAfterFill, not both."
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetClientWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function New-UiaPropertyCondition {
  param($Property, $Value)
  New-Object System.Windows.Automation.PropertyCondition($Property, $Value)
}

function ConvertTo-UiaArray {
  param($Collection)

  $items = @()
  if ($null -eq $Collection) {
    return $items
  }

  for ($i = 0; $i -lt $Collection.Count; $i++) {
    $items += $Collection.Item($i)
  }

  $items
}

function Find-UiaFirstByAutomationId {
  param($Root, [string]$AutomationId, [System.Windows.Automation.TreeScope]$Scope = [System.Windows.Automation.TreeScope]::Descendants)

  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::AutomationIdProperty) `
    $AutomationId

  $Root.FindFirst($Scope, $condition)
}

function Find-UiaChildrenByType {
  param($Root, $ControlType)

  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    $ControlType

  ConvertTo-UiaArray $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    $condition
  )
}

function Find-UiaDescendantsByType {
  param($Root, $ControlType)

  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    $ControlType

  ConvertTo-UiaArray $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $condition
  )
}

function Invoke-UiaElement {
  param($Element, [string]$Description)

  if (-not $Element) {
    throw "$Description not found."
  }

  $invokePattern = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern,
      [ref]$invokePattern
    )) {
    $invokePattern.Invoke()
    return "InvokePattern"
  }

  $selectionItemPattern = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$selectionItemPattern
    )) {
    $selectionItemPattern.Select()
    return "SelectionItemPattern"
  }

  throw "$Description does not support InvokePattern or SelectionItemPattern."
}

function Set-UiaTextValue {
  param($Root, [string]$AutomationId, [AllowNull()][string]$Value)

  if ($null -eq $Value) {
    return $false
  }

  $element = Find-UiaFirstByAutomationId $Root $AutomationId
  if (-not $element) {
    throw "Text field not found: $AutomationId"
  }

  $valuePattern = $null
  if (-not $element.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$valuePattern
    )) {
    throw "Text field does not support ValuePattern: $AutomationId"
  }

  $valuePattern.SetValue($Value)
  $true
}

function Set-OptionalUiaTextValue {
  param(
    $Root,
    [string]$ParameterName,
    [string]$AutomationId,
    [hashtable]$BoundParameters
  )

  if (-not $BoundParameters.ContainsKey($ParameterName)) {
    return $false
  }

  Set-UiaTextValue $Root $AutomationId ([string]$BoundParameters[$ParameterName])
}

function Select-Gender {
  param($Dialog, [string]$GenderValue)

  if ([string]::IsNullOrWhiteSpace($GenderValue)) {
    return ""
  }

  $targetIndex = switch ($GenderValue) {
    "Female" { 0 }
    "Male" { 1 }
    "Other" { 2 }
  }

  $radioButtons = @(
    Find-UiaDescendantsByType $Dialog ([System.Windows.Automation.ControlType]::RadioButton) |
      Sort-Object { $_.Current.BoundingRectangle.Left }
  )

  if ($radioButtons.Count -lt 3) {
    throw "Expected 3 gender radio buttons, found $($radioButtons.Count)."
  }

  $radio = $radioButtons[$targetIndex]
  if (-not $radio) {
    throw "Gender radio button not found: $GenderValue"
  }

  Invoke-UiaElement $radio "Gender $GenderValue" | Out-Null
  $GenderValue
}

function Format-TargetDate {
  param([string]$InputDate)

  if ([string]::IsNullOrWhiteSpace($InputDate)) {
    return $null
  }

  $parsed = [datetime]::MinValue
  if ([datetime]::TryParse($InputDate, [ref]$parsed)) {
    return $parsed.ToString("yyyy/MM/dd")
  }

  $InputDate
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
    if ($process) {
      return $process
    }

    Start-Sleep -Milliseconds 500
  } until ((Get-Date) -ge $deadline)

  throw "Phonak Target main window not found. Expected title pattern: $TitlePattern"
}

function Get-TargetRoot {
  param($TargetProcess)

  [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
}

function Get-PersonalDetailsDialog {
  param($Root)

  Find-UiaFirstByAutomationId $Root "Home.PatientManagement.PersonalDetailsDialogWindow"
}

function Open-ClientsAndSessions {
  param($Root)

  $homeTab = Find-UiaFirstByAutomationId $Root "Home.HomeTabControl"
  if (-not $homeTab) {
    throw "Home.HomeTabControl not found."
  }

  $bottomTabs = @(
    Find-UiaChildrenByType $homeTab ([System.Windows.Automation.ControlType]::TabItem) |
      Sort-Object { $_.Current.BoundingRectangle.Left }
  )

  if ($bottomTabs.Count -lt 1) {
    throw "Home bottom tabs not found."
  }

  Invoke-UiaElement $bottomTabs[0] "Clients & sessions bottom tab" | Out-Null
}

function Open-NewClientDialog {
  param($TargetProcess, [int]$Timeout)

  $root = Get-TargetRoot $TargetProcess
  $existingDialog = Get-PersonalDetailsDialog $root
  if ($existingDialog) {
    return @{
      Dialog = $existingDialog
      UsedExistingDialog = $true
    }
  }

  Open-ClientsAndSessions $root
  Start-Sleep -Milliseconds 700

  $root = Get-TargetRoot $TargetProcess
  $newClientButton = Find-UiaFirstByAutomationId $root "Home.PatientManagement.NewPatientButton"
  Invoke-UiaElement $newClientButton "New client button" | Out-Null

  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    Start-Sleep -Milliseconds 300
    $root = Get-TargetRoot $TargetProcess
    $dialog = Get-PersonalDetailsDialog $root
    if ($dialog) {
      return @{
        Dialog = $dialog
        UsedExistingDialog = $false
      }
    }
  } until ((Get-Date) -ge $deadline)

  throw "Personal details dialog did not appear."
}

function Get-ButtonEnabled {
  param($Root, [string]$AutomationId)

  $button = Find-UiaFirstByAutomationId $Root $AutomationId
  if (-not $button) {
    throw "Button not found: $AutomationId"
  }

  $button.Current.IsEnabled
}

function Wait-DialogClosed {
  param($TargetProcess, [int]$Timeout)

  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    Start-Sleep -Milliseconds 300
    $root = Get-TargetRoot $TargetProcess
    $dialog = Get-PersonalDetailsDialog $root
    if (-not $dialog) {
      return $true
    }
  } until ((Get-Date) -ge $deadline)

  $false
}

$targetProcess = Wait-TargetMainWindowProcess -TitlePattern $TargetTitlePattern -Timeout $TimeoutSeconds
[void][PhonakTargetClientWin32]::ShowWindow($targetProcess.MainWindowHandle, 9)
[void][PhonakTargetClientWin32]::SetForegroundWindow($targetProcess.MainWindowHandle)
Start-Sleep -Milliseconds 300

$openResult = Open-NewClientDialog -TargetProcess $targetProcess -Timeout $TimeoutSeconds
$dialog = $openResult.Dialog

$birthDateValue = Format-TargetDate $BirthDate

$setFields = @()
if (Set-UiaTextValue $dialog "Home.PatientManagement.PersonalDetails.LastNameTextBox" $LastName) { $setFields += "LastName" }
if (Set-UiaTextValue $dialog "Home.PatientManagement.PersonalDetails.FirstNameTextBox" $FirstName) { $setFields += "FirstName" }
if (Set-OptionalUiaTextValue $dialog "Address1" "Home.PatientManagement.PersonalDetails.Address1" $PSBoundParameters) { $setFields += "Address1" }
if (Set-OptionalUiaTextValue $dialog "Address2" "Home.PatientManagement.PersonalDetails.Address2" $PSBoundParameters) { $setFields += "Address2" }
if (Set-OptionalUiaTextValue $dialog "PostalCode" "Home.PatientManagement.PersonalDetails.PostalCode" $PSBoundParameters) { $setFields += "PostalCode" }
if (Set-OptionalUiaTextValue $dialog "City" "Home.PatientManagement.PersonalDetails.City" $PSBoundParameters) { $setFields += "City" }
if ($PSBoundParameters.ContainsKey("BirthDate")) {
  if (Set-UiaTextValue $dialog "Home.PatientManagement.PersonalDetails.BirthDate" $birthDateValue) { $setFields += "BirthDate" }
}
if (Set-OptionalUiaTextValue $dialog "Email" "Home.PatientManagement.PersonalDetails.Email" $PSBoundParameters) { $setFields += "Email" }
if (Set-OptionalUiaTextValue $dialog "PhoneHome" "Home.PatientManagement.PersonalDetails.PhoneHome" $PSBoundParameters) { $setFields += "PhoneHome" }
if (Set-OptionalUiaTextValue $dialog "PhoneBusiness" "Home.PatientManagement.PersonalDetails.PhoneBusiness" $PSBoundParameters) { $setFields += "PhoneBusiness" }

$selectedGender = Select-Gender $dialog $Gender
if ($selectedGender) {
  $setFields += "Gender"
}

Start-Sleep -Milliseconds 600
$root = Get-TargetRoot $targetProcess
$dialog = Get-PersonalDetailsDialog $root
if (-not $dialog) {
  throw "Personal details dialog closed unexpectedly before save/cancel."
}

$saveButtonId = "Home.PatientManagement.PersonalDetails.SaveButton"
$cancelButtonId = "Home.PatientManagement.PersonalDetails.CancelButton"
$saveEnabled = Get-ButtonEnabled $dialog $saveButtonId

if ($Save) {
  if (-not $saveEnabled) {
    throw "Save button is disabled after filling fields. SetFields=$($setFields -join ',')"
  }

  $saveButton = Find-UiaFirstByAutomationId $dialog $saveButtonId
  Invoke-UiaElement $saveButton "Save button" | Out-Null
  $closed = Wait-DialogClosed -TargetProcess $targetProcess -Timeout $TimeoutSeconds

  if ($closed) {
    "Status=Created"
  } else {
    "Status=SaveInvokedDialogStillOpen"
  }
} elseif ($CancelAfterFill) {
  $cancelButton = Find-UiaFirstByAutomationId $dialog $cancelButtonId
  Invoke-UiaElement $cancelButton "Cancel button" | Out-Null
  $closed = Wait-DialogClosed -TargetProcess $targetProcess -Timeout $TimeoutSeconds

  if ($closed) {
    "Status=FilledCancelled"
  } else {
    "Status=CancelInvokedDialogStillOpen"
  }
} else {
  "Status=FilledNotSaved"
}

"UsedExistingDialog=$($openResult.UsedExistingDialog)"
"SetFields=$($setFields -join ',')"
"SaveButtonEnabled=$saveEnabled"
"LastName=$LastName"
"FirstName=$FirstName"
if ($selectedGender) { "Gender=$selectedGender" }
if ($birthDateValue) { "BirthDate=$birthDateValue" }
