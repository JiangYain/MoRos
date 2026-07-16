param(
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [string]$ShortcutPath = "C:\Users\Public\Desktop\COMPASS GPS.lnk",
  [int]$TimeoutSeconds = 45,
  [switch]$LogOnWithRememberedCredentials
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$process = Get-WidexCompassGpsProcess -CompassPath $CompassPath
$launched = $false
$resolvedPath = Resolve-WidexCompassGpsExecutable -CompassPath $CompassPath -ShortcutPath $ShortcutPath

if (-not $process) {
  [void](Start-Process -FilePath $resolvedPath -PassThru)
  $launched = $true
}

$process = Wait-WidexCompassGpsProcess -CompassPath $resolvedPath -TimeoutSeconds $TimeoutSeconds
$loginDialog = Find-WidexElement -ProcessId $process.Id -AutomationId "TheDialog"
$logonMethod = ""

if ($loginDialog -and $LogOnWithRememberedCredentials) {
  $logon = Find-WidexElement `
    -ProcessId $process.Id `
    -Root $loginDialog `
    -AutomationId "Widex.Compass.Gui.Application.LogOn.Logon"
  if (-not $logon) { throw "Remembered-credentials logon button was not found." }
  if (-not $logon.Current.IsEnabled) { throw "Remembered-credentials logon button is disabled." }
  $logonMethod = Invoke-WidexElement -Element $logon -Description "COMPASS GPS logon button"
  [void](Wait-WidexElement -ProcessId $process.Id -AutomationId "CompassMainWindow" -TimeoutSeconds $TimeoutSeconds)
}

$mainWindow = Find-WidexElement -ProcessId $process.Id -AutomationId "CompassMainWindow"
$loginDialog = Find-WidexElement -ProcessId $process.Id -AutomationId "TheDialog"

$status = if ($mainWindow) {
  "Ready"
} elseif ($loginDialog) {
  "LoginRequired"
} else {
  "StartedNoRecognizedWindow"
}

$file = Get-Item -LiteralPath $resolvedPath
[pscustomobject]@{
  Status = $status
  Launched = $launched
  ProcessId = $process.Id
  Path = $resolvedPath
  ProductVersion = $file.VersionInfo.ProductVersion
  MainWindowFound = [bool]$mainWindow
  MainWindowTitle = if ($mainWindow) { $mainWindow.Current.Name } else { "" }
  LoginDialogFound = [bool]$loginDialog
  LogOnMethod = $logonMethod
}
