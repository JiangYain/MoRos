param(
  [string]$TargetPath,
  [string]$SearchRoot = "${env:ProgramFiles(x86)}\Phonak",
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

function Resolve-TargetExecutable {
  param(
    [string]$ExplicitPath,
    [string]$Root
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) {
      throw "Target.exe not found at the explicit path: $ExplicitPath"
    }

    $resolvedExplicitPath = (Get-Item -LiteralPath $ExplicitPath).FullName
    return [pscustomobject]@{
      Path = $resolvedExplicitPath
      Source = "ExplicitPath"
      CandidateCount = 1
    }
  }

  if ([string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Phonak search root not found: $Root. Pass -TargetPath with the full path to Target.exe."
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $Root -Filter "Target.exe" -File -Recurse -Force -ErrorAction SilentlyContinue |
      Sort-Object -Property FullName
  )

  if ($candidates.Count -eq 0) {
    throw "Target.exe was not found under: $Root. Pass -TargetPath with the full path to Target.exe."
  }

  if ($candidates.Count -gt 1) {
    $candidateText = ($candidates.FullName | ForEach-Object { "- $_" }) -join "`n"
    Write-Warning "Multiple Target.exe files were found. Selecting the first path in sorted order:`n$candidateText"
  }

  return [pscustomobject]@{
    Path = $candidates[0].FullName
    Source = "AutoDiscovery"
    CandidateCount = $candidates.Count
  }
}

function Get-TargetMainWindow {
  Get-Process -Name Target -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -match "Phonak Target 12\.0"
    } |
    Select-Object -First 1
}

$targetProcess = Get-TargetMainWindow
$selection = $null
if (-not $targetProcess) {
  $selection = Resolve-TargetExecutable -ExplicitPath $TargetPath -Root $SearchRoot
  [void](Start-Process -FilePath $selection.Path -PassThru)
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Milliseconds 500
  $targetProcess = Get-TargetMainWindow
} until ($targetProcess -or (Get-Date) -ge $deadline)

if (-not $targetProcess) {
  $runningTargets = Get-Process -Name Target -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, MainWindowTitle, Path

  $runningText = if ($runningTargets) {
    ($runningTargets | Format-List | Out-String).Trim()
  } else {
    "No Target process is running."
  }

  throw "Timed out waiting for main window title 'Phonak Target 12.0'. Running Target processes:`n$runningText"
}

[pscustomobject]@{
  Status = "Ready"
  Id = $targetProcess.Id
  ProcessName = $targetProcess.ProcessName
  MainWindowTitle = $targetProcess.MainWindowTitle
  Path = $targetProcess.Path
  SelectedTargetPath = if ($selection) { $selection.Path } else { $targetProcess.Path }
  SelectionSource = if ($selection) { $selection.Source } else { "ExistingProcess" }
  CandidateCount = if ($selection) { $selection.CandidateCount } else { 0 }
} | Format-List
