param(
  [Parameter(Mandatory = $true)]
  [string]$FirstName,

  [Parameter(Mandatory = $true)]
  [string]$LastName,

  [string]$Title,
  [string]$BirthDate,
  [string]$Gender,
  [string]$PrimaryPhone,
  [string]$SecondaryPhone,
  [string]$Email,
  [string]$Address1,
  [string]$Address2,
  [string]$Address3,
  [string]$City,
  [string]$State,
  [string]$Zip,
  [string]$Country,
  [string]$Occupation,
  [string]$Physician,
  [string]$Referral,
  [string]$Insurance1,
  [string]$InsuranceNumber,
  [string]$SocialSecurityNumber,
  [string]$Other1,
  [string]$Other2,
  [string]$Fax,
  [string]$Comments,
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 20,
  [switch]$Save,
  [switch]$CancelAfterFill
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

if ($Save -and $CancelAfterFill) {
  throw "Use either -Save or -CancelAfterFill, not both."
}

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$browser = Wait-WidexElement `
  -ProcessId $process.Id `
  -AutomationId "PatientBrowserView.Dialog" `
  -TimeoutSeconds $TimeoutSeconds
$newPatient = Find-WidexElement `
  -ProcessId $process.Id `
  -Root $browser `
  -AutomationId "Widex.Compass.PatientBrowser.NewPatient"
if (-not $newPatient) { throw "New patient button was not found." }

$existingDialog = Find-WidexElement -ProcessId $process.Id -AutomationId "PatientDetails.Dialog"
if (-not $existingDialog) {
  $openMethod = Invoke-WidexElement -Element $newPatient -Description "New patient button"
  $dialog = Wait-WidexElement `
    -ProcessId $process.Id `
    -AutomationId "PatientDetails.Dialog" `
    -TimeoutSeconds $TimeoutSeconds
} else {
  $openMethod = "ExistingDialog"
  $dialog = $existingDialog
}

try {
$elementById = Get-WidexElementIndex -Root $dialog
$fieldMap = [ordered]@{
  Title = "Widex.Compass.PatientDetails.Title"
  FirstName = "Widex.Compass.PatientDetails.FirstName"
  LastName = "Widex.Compass.PatientDetails.LastName"
  PrimaryPhone = "Widex.Compass.PatientDetails.PrimaryPhone"
  SecondaryPhone = "Widex.Compass.PatientDetails.SecondaryPhone"
  Email = "Widex.Compass.PatientDetails.Email"
  Address1 = "Widex.Compass.PatientDetails.Address1"
  Address2 = "Widex.Compass.PatientDetails.Address2"
  Address3 = "Widex.Compass.PatientDetails.Address3"
  City = "Widex.Compass.PatientDetails.City"
  State = "Widex.Compass.PatientDetails.State"
  Zip = "Widex.Compass.PatientDetails.Zip"
  Country = "Widex.Compass.PatientDetails.Country"
  Occupation = "Widex.Compass.PatientDetails.Occupation"
  Physician = "Widex.Compass.PatientDetails.Physican"
  Referral = "Widex.Compass.PatientDetails.Referal"
  Insurance1 = "Widex.Compass.PatientDetails.Insurance1"
  InsuranceNumber = "Widex.Compass.PatientDetails.InsuranceNo"
  SocialSecurityNumber = "Widex.Compass.PatientDetails.SocSecNo"
  Other1 = "Widex.Compass.PatientDetails.Other1"
  Other2 = "Widex.Compass.PatientDetails.Other2"
  Fax = "Widex.Compass.PatientDetails.Fax"
  Comments = "Widex.Compass.PatientDetails.Comments"
}

$setFields = @()
foreach ($entry in $fieldMap.GetEnumerator()) {
  if ($entry.Key -in @("FirstName", "LastName") -or $PSBoundParameters.ContainsKey($entry.Key)) {
    $value = [string](Get-Variable -Name $entry.Key -ValueOnly)
    $element = $elementById[$entry.Value]
    Set-WidexValue -Element $element -Value $value -Description $entry.Key
    $actual = Get-WidexValue $element
    if ($actual -ne $value) {
      throw "$($entry.Key) verification failed. Expected='$value' Actual='$actual'."
    }
    $setFields += $entry.Key
  }
}

if ($PSBoundParameters.ContainsKey("BirthDate")) {
  $datePicker = $elementById["Widex.Compass.PatientDetails.DateOfBirth"]
  if (-not $datePicker) { throw "DateOfBirth picker was not found." }
  $dateText = $elementById["DatePickerTextBox"]
  Set-WidexValue -Element $dateText -Value $BirthDate -Description "BirthDate"
  $birthDateActual = Get-WidexValue $dateText
  $setFields += "BirthDate"
}

if ($PSBoundParameters.ContainsKey("Gender")) {
  $genderCombo = $elementById["Widex.Compass.PatientDetails.Gender"]
  $genderMethod = Set-WidexComboSelection -ProcessId $process.Id -ComboBox $genderCombo -ItemName $Gender
  $setFields += "Gender"
}

Start-Sleep -Milliseconds 450
$okButton = $elementById["Ok"]
$cancelButton = $elementById["Cancel"]
if (-not $okButton -or -not $cancelButton) { throw "Patient details OK/Cancel buttons were not found." }
$saveEnabled = $okButton.Current.IsEnabled

if ($Save) {
  if (-not $saveEnabled) {
    throw "Patient details confirmation button is disabled. SetFields=$($setFields -join ',')"
  }
  $finalMethod = Invoke-WidexElement -Element $okButton -Description "Patient details confirmation button"
  $closed = Wait-WidexElement `
    -ProcessId $process.Id `
    -AutomationId "PatientDetails.Dialog" `
    -TimeoutSeconds $TimeoutSeconds `
    -Disappear
  $status = if ($closed) { "Created" } else { "SaveInvokedDialogStillOpen" }
} elseif ($CancelAfterFill) {
  $finalMethod = Invoke-WidexElement -Element $cancelButton -Description "Patient details cancel button"
  $closed = Wait-WidexElement `
    -ProcessId $process.Id `
    -AutomationId "PatientDetails.Dialog" `
    -TimeoutSeconds $TimeoutSeconds `
    -Disappear
  $status = if ($closed) { "FilledCancelled" } else { "CancelInvokedDialogStillOpen" }
} else {
  $finalMethod = "None"
  $status = "FilledNotSaved"
}

[pscustomobject]@{
  Status = $status
  ProcessId = $process.Id
  OpenMethod = $openMethod
  FinalMethod = $finalMethod
  SetFields = ($setFields -join ",")
  SaveButtonEnabled = $saveEnabled
  FirstName = $FirstName
  LastName = $LastName
  Gender = if ($PSBoundParameters.ContainsKey("Gender")) { $Gender } else { "" }
  GenderMethod = if ($PSBoundParameters.ContainsKey("Gender")) { $genderMethod } else { "" }
  BirthDate = if ($PSBoundParameters.ContainsKey("BirthDate")) { $birthDateActual } else { "" }
}
} catch {
  $dialogToCancel = Find-WidexElement -ProcessId $process.Id -AutomationId "PatientDetails.Dialog"
  if ($dialogToCancel) {
    $cancelOnError = Find-WidexElement -ProcessId $process.Id -Root $dialogToCancel -AutomationId "Cancel"
    if ($cancelOnError -and $cancelOnError.Current.IsEnabled) {
      try { [void](Invoke-WidexElement -Element $cancelOnError -Description "Patient details cancel button") } catch {}
    }
  }
  throw
}
