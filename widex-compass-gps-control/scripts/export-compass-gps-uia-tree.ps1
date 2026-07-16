param(
  [string]$OutputPath,
  [string]$CompassPath = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe",
  [int]$MaxDepth = 20,
  [switch]$ControlView
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\WidexCompassGps.Common.ps1"

$process = Wait-WidexCompassGpsProcess -CompassPath $CompassPath -TimeoutSeconds 10
$roots = @(Get-WidexTopLevelWindows -ProcessId $process.Id)
if ($roots.Count -eq 0) { throw "No top-level COMPASS GPS UIA windows were found." }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path (Split-Path $PSScriptRoot -Parent) "references\uia-tree-$stamp.txt"
}

$directory = Split-Path -Path $OutputPath -Parent
if ($directory -and -not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$walker = if ($ControlView) {
  [System.Windows.Automation.TreeWalker]::ControlViewWalker
} else {
  [System.Windows.Automation.TreeWalker]::RawViewWalker
}

$lines = New-Object System.Collections.Generic.List[string]
function Write-ElementTree {
  param($Element, [int]$Depth)

  if (-not $Element -or $Depth -gt $MaxDepth) { return }
  try {
    $rect = $Element.Current.BoundingRectangle
    $line = "{0}{1} Name='{2}' AutomationId='{3}' ClassName='{4}' Enabled={5} Offscreen={6} Rect={7}" -f `
      ("  " * $Depth),
      $Element.Current.ControlType.ProgrammaticName,
      ($Element.Current.Name -replace "'", "''"),
      ($Element.Current.AutomationId -replace "'", "''"),
      ($Element.Current.ClassName -replace "'", "''"),
      $Element.Current.IsEnabled,
      $Element.Current.IsOffscreen,
      $rect.ToString()
    $lines.Add($line)

    $child = $walker.GetFirstChild($Element)
    while ($child) {
      Write-ElementTree -Element $child -Depth ($Depth + 1)
      $child = $walker.GetNextSibling($child)
    }
  } catch {
    $lines.Add(("  " * $Depth) + "<UIA element unavailable: $($_.Exception.Message)>")
  }
}

foreach ($root in $roots) {
  Write-ElementTree -Element $root -Depth 0
}

$lines | Set-Content -LiteralPath $OutputPath -Encoding UTF8
[pscustomobject]@{
  Status = "Exported"
  OutputPath = (Get-Item -LiteralPath $OutputPath).FullName
  ProcessId = $process.Id
  RootCount = $roots.Count
  LineCount = $lines.Count
  View = if ($ControlView) { "ControlView" } else { "RawView" }
}
