param(
  [string]$MainTab,
  [string]$StartPage,
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$TimeoutSeconds = 10,
  [switch]$ListAvailable,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$mainMap = @{
  "startsession" = "TopNavigation.StartSession"
  "sessionstart" = "TopNavigation.StartSession"
  "会话启动" = "TopNavigation.StartSession"
  "selection" = "TopNavigation.Selection"
  "select" = "TopNavigation.Selection"
  "选择" = "TopNavigation.Selection"
  "fitting" = "TopNavigation.Fitting"
  "选配" = "TopNavigation.Fitting"
  "finetuning" = "TopNavigation.Finetuning"
  "fine tuning" = "TopNavigation.Finetuning"
  "微调" = "TopNavigation.Finetuning"
  "logging" = "TopNavigation.Logging"
  "log" = "TopNavigation.Logging"
  "登录" = "TopNavigation.Logging"
  "handling" = "TopNavigation.Handling"
  "操作" = "TopNavigation.Handling"
  "close" = "TopNavigation.Close"
  "结束" = "TopNavigation.Close"
}

$startMap = @{
  "overview" = "StartSessionMenuOverview"
  "summary" = "StartSessionMenuOverview"
  "总结" = "StartSessionMenuOverview"
  "audiometry" = "FittingMenuPrecondition"
  "hearingtest" = "FittingMenuPrecondition"
  "测听" = "FittingMenuPrecondition"
  "firmware" = "StartSessionMenuFirmwareCommonUpdate"
  "固件升级" = "StartSessionMenuFirmwareCommonUpdate"
  "transfer" = "StartSessionMenuImportSettings"
  "转移设置" = "StartSessionMenuImportSettings"
  "qualityassurance" = "StartSessionMenuQualityAssurance"
  "qa" = "StartSessionMenuQualityAssurance"
  "质量保证" = "StartSessionMenuQualityAssurance"
  "privacy" = "StartSessionMenuFirmwareUpdate"
  "客户隐私" = "StartSessionMenuFirmwareUpdate"
  "setup" = "StartSessionMenuSetup"
  "installation" = "StartSessionMenuSetup"
  "compass安装" = "StartSessionMenuSetup"
}

if ($ListAvailable) {
  [pscustomobject]@{
    Status = "Available"
    MainTabs = @("StartSession", "Selection", "Fitting", "Finetuning", "Logging", "Handling", "Close")
    StartPages = @("Overview", "Audiometry", "Firmware", "Transfer", "QualityAssurance", "Privacy", "Setup")
  }
  exit 0
}

if (-not $MainTab -and -not $StartPage) {
  throw "Provide -MainTab, -StartPage, or -ListAvailable."
}

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds $TimeoutSeconds
$actions = @()

if ($MainTab) {
  $key = $MainTab.Trim().ToLowerInvariant()
  if (-not $mainMap.ContainsKey($key)) { throw "Unsupported MainTab: $MainTab" }
  $id = $mainMap[$key]
  $element = Find-WidexElement -ProcessId $process.Id -AutomationId $id
  if (-not $element) { throw "Main navigation element not found: $id" }
  if (-not $element.Current.IsEnabled) { throw "Main navigation element is disabled: $id" }
  $method = "DryRun"
  $verified = $false
  if (-not $DryRun) {
    $method = Select-WidexElement -Element $element -Description "Main tab $MainTab"
    Start-Sleep -Milliseconds 500
    $element = Find-WidexElement -ProcessId $process.Id -AutomationId $id
    $verified = Get-WidexSelectionState $element
    if (-not $verified) {
      $fallbackMethod = Invoke-WidexElementPointerClick -ProcessId $process.Id -Element $element -Description "Main tab $MainTab"
      $method = "$method->$fallbackMethod"
      $element = Find-WidexElement -ProcessId $process.Id -AutomationId $id
      $verified = Get-WidexSelectionState $element
    }
    if (-not $verified) { throw "Main tab verification failed: $MainTab" }
  }
  $actions += [pscustomobject]@{ Kind = "MainTab"; Requested = $MainTab; AutomationId = $id; Method = $method; Verified = $verified }
}

if ($StartPage) {
  $key = $StartPage.Trim().ToLowerInvariant().Replace(" ", "")
  if (-not $startMap.ContainsKey($key)) { throw "Unsupported StartPage: $StartPage" }
  $id = $startMap[$key]
  $element = Find-WidexElement -ProcessId $process.Id -AutomationId $id
  if (-not $element) { throw "Start page element not found: $id" }
  if (-not $element.Current.IsEnabled) { throw "Start page element is disabled: $id" }
  $method = "DryRun"
  $verified = $false
  if (-not $DryRun) {
    $method = Select-WidexElement -Element $element -Description "Start page $StartPage"
    Start-Sleep -Milliseconds 500
    $element = Find-WidexElement -ProcessId $process.Id -AutomationId $id
    $verified = Get-WidexSelectionState $element
    if (-not $verified) {
      $fallbackMethod = Invoke-WidexElementPointerClick -ProcessId $process.Id -Element $element -Description "Start page $StartPage"
      $method = "$method->$fallbackMethod"
      $element = Find-WidexElement -ProcessId $process.Id -AutomationId $id
      $verified = Get-WidexSelectionState $element
    }
    if (-not $verified) { throw "Start page verification failed: $StartPage" }
  }
  $actions += [pscustomobject]@{ Kind = "StartPage"; Requested = $StartPage; AutomationId = $id; Method = $method; Verified = $verified }
}

[pscustomobject]@{
  Status = if ($DryRun) { "DryRun" } else { "Set" }
  ProcessId = $process.Id
  Actions = @($actions)
}
