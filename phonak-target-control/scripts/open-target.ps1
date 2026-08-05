param(
  [string]$TargetPath = $env:COMPASS_PHONAK_TARGET_PATH,
  [string]$SearchRoot = "${env:ProgramFiles(x86)}\Phonak",
  [int]$TimeoutSeconds = 45,
  [switch]$ResolveOnly
)

$ErrorActionPreference = "Stop"

function Resolve-TargetExecutable {
  param(
    [string]$ExplicitPath,
    [string]$ExplicitSource,
    [string]$Root
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) {
      throw "Target.exe not found at the selected path: $ExplicitPath"
    }
    $file = Get-Item -LiteralPath $ExplicitPath
    if ($file.Name -ine "Target.exe") {
      throw "The selected executable must be named Target.exe: $ExplicitPath"
    }
    return [pscustomobject]@{
      Path = $file.FullName
      Source = $ExplicitSource
      CandidateCount = 1
      FileVersion = $file.VersionInfo.FileVersion
    }
  }

  if ([string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Phonak search root not found: $Root. Select Target.exe in Compass Dependencies or pass -TargetPath."
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $Root -Filter "Target.exe" -File -Recurse -Force -ErrorAction SilentlyContinue |
      ForEach-Object {
        $versionText = $_.VersionInfo.FileVersion
        $sortVersion = try {
          [version](([regex]::Match($versionText, '\d+(?:\.\d+){1,3}')).Value)
        } catch {
          [version]"0.0"
        }
        [pscustomobject]@{
          Path = $_.FullName
          FileVersion = $versionText
          SortVersion = $sortVersion
        }
      } |
      Sort-Object -Property `
        @{ Expression = { $_.SortVersion }; Descending = $true },
        @{ Expression = { $_.Path }; Descending = $false }
  )

  if ($candidates.Count -eq 0) {
    throw "Target.exe was not found under: $Root. Select it in Compass Dependencies or pass -TargetPath."
  }

  if ($candidates.Count -gt 1) {
    $candidateText = ($candidates | ForEach-Object { "- $($_.Path) [$($_.FileVersion)]" }) -join "`n"
    Write-Warning "Multiple Target.exe files were found. Using the highest file version for this run:`n$candidateText"
  }

  return [pscustomobject]@{
    Path = $candidates[0].Path
    Source = "AutoDiscovery"
    CandidateCount = $candidates.Count
    FileVersion = $candidates[0].FileVersion
  }
}

function Get-ProcessExecutablePath {
  param([System.Diagnostics.Process]$Process)
  try {
    return $Process.Path
  } catch {
    return $null
  }
}

function Get-SelectedTargetProcesses {
  param([string]$ExecutablePath)

  Get-Process -Name Target -ErrorAction SilentlyContinue |
    Where-Object {
      $processPath = Get-ProcessExecutablePath -Process $_
      -not [string]::IsNullOrWhiteSpace($processPath) -and
        [string]::Equals(
          [System.IO.Path]::GetFullPath($processPath),
          [System.IO.Path]::GetFullPath($ExecutablePath),
          [System.StringComparison]::OrdinalIgnoreCase
        )
    }
}

function Get-SelectedTargetMainWindow {
  param([string]$ExecutablePath)

  Get-SelectedTargetProcesses -ExecutablePath $ExecutablePath |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -match '^Phonak Target\s+\d+(?:\.\d+)+'
    } |
    Select-Object -First 1
}

$explicitSource = if ($PSBoundParameters.ContainsKey("TargetPath")) {
  "ExplicitPath"
} elseif (-not [string]::IsNullOrWhiteSpace($env:COMPASS_PHONAK_TARGET_PATH)) {
  "CompassSettings"
} else {
  "AutoDiscovery"
}
$selection = Resolve-TargetExecutable `
  -ExplicitPath $TargetPath `
  -ExplicitSource $explicitSource `
  -Root $SearchRoot

if ($ResolveOnly) {
  [pscustomobject]@{
    Status = "Resolved"
    SelectedTargetPath = $selection.Path
    SelectionSource = $selection.Source
    SelectedFileVersion = $selection.FileVersion
    CandidateCount = $selection.CandidateCount
  } | Format-List
  return
}

$targetProcess = Get-SelectedTargetMainWindow -ExecutablePath $selection.Path
$selectedProcesses = @(Get-SelectedTargetProcesses -ExecutablePath $selection.Path)
$launchAction = "ReusedVisibleWindow"

if (-not $targetProcess -and $selectedProcesses.Count -eq 0) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $selection.Path
  $startInfo.WorkingDirectory = Split-Path -Parent $selection.Path
  $startInfo.UseShellExecute = $true
  $startedProcess = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $startedProcess) {
    throw "Windows did not start the selected Target.exe: $($selection.Path)"
  }
  $launchAction = "StartedSelectedExecutable"
} elseif (-not $targetProcess) {
  $launchAction = "WaitedForSelectedProcess"
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  $targetProcess = Get-SelectedTargetMainWindow -ExecutablePath $selection.Path
  if ($targetProcess) { break }
  Start-Sleep -Milliseconds 350
} while ((Get-Date) -lt $deadline)

if (-not $targetProcess) {
  $runningTargets = @(
    Get-Process -Name Target -ErrorAction SilentlyContinue |
      ForEach-Object {
        [pscustomobject]@{
          Id = $_.Id
          MainWindowTitle = $_.MainWindowTitle
          Path = Get-ProcessExecutablePath -Process $_
        }
      }
  )
  $runningText = if ($runningTargets.Count -gt 0) {
    ($runningTargets | Format-List | Out-String).Trim()
  } else {
    "No Target process is running."
  }
  throw "Timed out waiting for the selected Target executable to show its main window. SelectedPath=$($selection.Path); SelectionSource=$($selection.Source). Running Target processes:`n$runningText"
}

$otherTargetCount = @(
  Get-Process -Name Target -ErrorAction SilentlyContinue |
    Where-Object {
      $processPath = Get-ProcessExecutablePath -Process $_
      [string]::IsNullOrWhiteSpace($processPath) -or
        -not [string]::Equals(
          [System.IO.Path]::GetFullPath($processPath),
          [System.IO.Path]::GetFullPath($selection.Path),
          [System.StringComparison]::OrdinalIgnoreCase
        )
    }
).Count

[pscustomobject]@{
  Status = "Ready"
  Id = $targetProcess.Id
  ProcessName = $targetProcess.ProcessName
  MainWindowTitle = $targetProcess.MainWindowTitle
  Path = Get-ProcessExecutablePath -Process $targetProcess
  SelectedTargetPath = $selection.Path
  SelectionSource = $selection.Source
  SelectedFileVersion = $selection.FileVersion
  CandidateCount = $selection.CandidateCount
  LaunchAction = $launchAction
  OtherTargetProcessCount = $otherTargetCount
} | Format-List
