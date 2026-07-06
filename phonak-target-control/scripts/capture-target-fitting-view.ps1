param(
  [string]$OutputPath,
  [string]$TargetTitle = "Phonak Target 12.0",
  [int]$TimeoutSeconds = 10,
  [switch]$IncludeWindowFrame
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class PhonakTargetCaptureWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
}
"@

[void][PhonakTargetCaptureWin32]::SetProcessDPIAware()

function Get-WindowTitle {
  param([IntPtr]$Handle)

  $length = [PhonakTargetCaptureWin32]::GetWindowTextLength($Handle)
  if ($length -le 0) {
    return ""
  }

  $builder = New-Object System.Text.StringBuilder($length + 1)
  [void][PhonakTargetCaptureWin32]::GetWindowText($Handle, $builder, $builder.Capacity)
  $builder.ToString()
}

function Find-TargetWindow {
  param([string]$Title, [int]$Timeout)

  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    $matches = New-Object System.Collections.Generic.List[System.IntPtr]
    $callback = [PhonakTargetCaptureWin32+EnumWindowsProc]{
      param([IntPtr]$hWnd, [IntPtr]$lParam)

      if ([PhonakTargetCaptureWin32]::IsWindowVisible($hWnd)) {
        $windowTitle = Get-WindowTitle $hWnd
        if ($windowTitle -eq $Title) {
          $matches.Add($hWnd) | Out-Null
        }
      }

      return $true
    }

    [void][PhonakTargetCaptureWin32]::EnumWindows($callback, [IntPtr]::Zero)
    if ($matches.Count -gt 0) {
      return $matches[0]
    }

    Start-Sleep -Milliseconds 500
  } until ((Get-Date) -ge $deadline)

  throw "Target window not found. Expected title: $Title"
}

function Get-CaptureRectangle {
  param([IntPtr]$Handle, [bool]$UseWindowFrame)

  if ($UseWindowFrame) {
    $rect = New-Object PhonakTargetCaptureWin32+RECT
    if (-not [PhonakTargetCaptureWin32]::GetWindowRect($Handle, [ref]$rect)) {
      throw "GetWindowRect failed."
    }

    return [pscustomobject]@{
      Left = $rect.Left
      Top = $rect.Top
      Width = $rect.Right - $rect.Left
      Height = $rect.Bottom - $rect.Top
      Mode = "WindowFrame"
    }
  }

  $clientRect = New-Object PhonakTargetCaptureWin32+RECT
  if (-not [PhonakTargetCaptureWin32]::GetClientRect($Handle, [ref]$clientRect)) {
    throw "GetClientRect failed."
  }

  $topLeft = New-Object PhonakTargetCaptureWin32+POINT
  $topLeft.X = 0
  $topLeft.Y = 0
  if (-not [PhonakTargetCaptureWin32]::ClientToScreen($Handle, [ref]$topLeft)) {
    throw "ClientToScreen failed."
  }

  [pscustomobject]@{
    Left = $topLeft.X
    Top = $topLeft.Y
    Width = $clientRect.Right - $clientRect.Left
    Height = $clientRect.Bottom - $clientRect.Top
    Mode = "ClientArea"
  }
}

function Test-FittingPage {
  param([IntPtr]$Handle)

  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    for ($i = 0; $i -lt $elements.Count; $i++) {
      $automationId = $elements.Item($i).Current.AutomationId
      $className = $elements.Item($i).Current.ClassName
      if ($automationId -match "^Fitting\\." -or $className -match "^Fitting") {
        return $true
      }
    }
    return $false
  } catch {
    return $false
  }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $outputDirectory = Join-Path ([Environment]::GetFolderPath("Desktop")) "FAI"
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path $outputDirectory "target-fitting-view-$stamp.png"
} else {
  $outputDirectory = Split-Path -Path $OutputPath -Parent
  if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }
}

$targetHandle = Find-TargetWindow -Title $TargetTitle -Timeout $TimeoutSeconds

if ([PhonakTargetCaptureWin32]::IsIconic($targetHandle)) {
  [void][PhonakTargetCaptureWin32]::ShowWindow($targetHandle, 9)
} else {
  [void][PhonakTargetCaptureWin32]::ShowWindow($targetHandle, 9)
}
[void][PhonakTargetCaptureWin32]::SetForegroundWindow($targetHandle)
Start-Sleep -Milliseconds 700

$captureRect = Get-CaptureRectangle -Handle $targetHandle -UseWindowFrame ([bool]$IncludeWindowFrame)
if ($captureRect.Width -le 0 -or $captureRect.Height -le 0) {
  throw "Invalid capture rectangle: $($captureRect.Width)x$($captureRect.Height)"
}

$bitmap = $null
$graphics = $null
try {
  $bitmap = New-Object System.Drawing.Bitmap($captureRect.Width, $captureRect.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen(
    $captureRect.Left,
    $captureRect.Top,
    0,
    0,
    (New-Object System.Drawing.Size($captureRect.Width, $captureRect.Height))
  )
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  if ($graphics) { $graphics.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
}

"Status=Captured"
"OutputPath=$OutputPath"
"TargetTitle=$TargetTitle"
"CaptureMode=$($captureRect.Mode)"
"Left=$($captureRect.Left)"
"Top=$($captureRect.Top)"
"Width=$($captureRect.Width)"
"Height=$($captureRect.Height)"
"DetectedFittingPage=$(Test-FittingPage $targetHandle)"
