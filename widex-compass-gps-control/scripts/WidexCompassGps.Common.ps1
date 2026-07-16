$script:WidexCompassGpsDefaultExe = "C:\Program Files (x86)\Widex\CompassGPS\Compass.exe"
$script:WidexCompassGpsDefaultShortcut = "C:\Users\Public\Desktop\COMPASS GPS.lnk"

function Initialize-WidexCompassGpsAutomation {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  if (-not ("WidexCompassGpsWin32" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WidexCompassGpsWin32 {
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
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(
    IntPtr hWnd,
    IntPtr hWndInsertAfter,
    int X,
    int Y,
    int cx,
    int cy,
    uint uFlags
  );

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT point);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(
    IntPtr hwnd,
    int dwAttribute,
    out RECT pvAttribute,
    int cbAttribute
  );
}
"@
  }

  [void][WidexCompassGpsWin32]::SetProcessDPIAware()
}

Initialize-WidexCompassGpsAutomation

function ConvertTo-WidexUiaArray {
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

function New-WidexUiaPropertyCondition {
  param($Property, $Value)

  New-Object System.Windows.Automation.PropertyCondition($Property, $Value)
}

function Get-WidexCompassGpsProcess {
  param([string]$CompassPath = $script:WidexCompassGpsDefaultExe)

  $resolvedPath = $null
  if ($CompassPath -and (Test-Path -LiteralPath $CompassPath -PathType Leaf)) {
    $resolvedPath = (Get-Item -LiteralPath $CompassPath).FullName
  }

  $processes = @(Get-Process -Name Compass -ErrorAction SilentlyContinue)
  if ($resolvedPath) {
    $exact = @($processes | Where-Object {
      try { $_.Path -eq $resolvedPath } catch { $false }
    })
    if ($exact.Count -gt 0) {
      return $exact | Sort-Object StartTime | Select-Object -Last 1
    }
  }

  $processes | Sort-Object StartTime | Select-Object -Last 1
}

function Wait-WidexCompassGpsProcess {
  param(
    [string]$CompassPath = $script:WidexCompassGpsDefaultExe,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $process = Get-WidexCompassGpsProcess -CompassPath $CompassPath
    if ($process) {
      return $process
    }
    Start-Sleep -Milliseconds 350
  } until ((Get-Date) -ge $deadline)

  throw "COMPASS GPS process was not found within $TimeoutSeconds seconds."
}

function Get-WidexTopLevelWindows {
  param([int]$ProcessId)

  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $condition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ProcessIdProperty) `
    $ProcessId

  ConvertTo-WidexUiaArray $desktop.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    $condition
  )
}

function Test-WidexElementMatch {
  param(
    $Element,
    [string]$AutomationId,
    [string]$Name,
    $ControlType
  )

  if ($AutomationId -and $Element.Current.AutomationId -ne $AutomationId) {
    return $false
  }
  if ($Name -and $Element.Current.Name -ne $Name) {
    return $false
  }
  if ($ControlType -and $Element.Current.ControlType -ne $ControlType) {
    return $false
  }
  $true
}

function Find-WidexElement {
  param(
    [int]$ProcessId,
    $Root,
    [string]$AutomationId,
    [string]$Name,
    $ControlType,
    [System.Windows.Automation.TreeScope]$Scope = [System.Windows.Automation.TreeScope]::Descendants
  )

  $roots = if ($Root) { @($Root) } else { @(Get-WidexTopLevelWindows -ProcessId $ProcessId) }
  foreach ($candidateRoot in $roots) {
    if (Test-WidexElementMatch -Element $candidateRoot -AutomationId $AutomationId -Name $Name -ControlType $ControlType) {
      return $candidateRoot
    }

    $conditions = New-Object System.Collections.Generic.List[System.Windows.Automation.Condition]
    if ($AutomationId) {
      $conditions.Add((New-WidexUiaPropertyCondition `
        ([System.Windows.Automation.AutomationElement]::AutomationIdProperty) `
        $AutomationId))
    }
    if ($Name) {
      $conditions.Add((New-WidexUiaPropertyCondition `
        ([System.Windows.Automation.AutomationElement]::NameProperty) `
        $Name))
    }
    if ($ControlType) {
      $conditions.Add((New-WidexUiaPropertyCondition `
        ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
        $ControlType))
    }

    if ($conditions.Count -eq 0) {
      throw "Find-WidexElement requires AutomationId, Name, or ControlType."
    }

    $condition = if ($conditions.Count -eq 1) {
      $conditions[0]
    } else {
      New-Object System.Windows.Automation.AndCondition($conditions.ToArray())
    }

    $found = $candidateRoot.FindFirst($Scope, $condition)
    if ($found) {
      return $found
    }
  }
  $null
}

function Find-WidexElements {
  param(
    [int]$ProcessId,
    $Root,
    [string]$AutomationId,
    [string]$Name,
    $ControlType,
    [System.Windows.Automation.TreeScope]$Scope = [System.Windows.Automation.TreeScope]::Descendants
  )

  $all = @()
  $roots = if ($Root) { @($Root) } else { @(Get-WidexTopLevelWindows -ProcessId $ProcessId) }
  foreach ($candidateRoot in $roots) {
    if (Test-WidexElementMatch -Element $candidateRoot -AutomationId $AutomationId -Name $Name -ControlType $ControlType) {
      $all += $candidateRoot
    }

    $conditionParts = @()
    if ($AutomationId) {
      $conditionParts += New-WidexUiaPropertyCondition `
        ([System.Windows.Automation.AutomationElement]::AutomationIdProperty) `
        $AutomationId
    }
    if ($Name) {
      $conditionParts += New-WidexUiaPropertyCondition `
        ([System.Windows.Automation.AutomationElement]::NameProperty) `
        $Name
    }
    if ($ControlType) {
      $conditionParts += New-WidexUiaPropertyCondition `
        ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
        $ControlType
    }

    if ($conditionParts.Count -eq 0) {
      throw "Find-WidexElements requires AutomationId, Name, or ControlType."
    }

    $condition = if ($conditionParts.Count -eq 1) {
      $conditionParts[0]
    } else {
      New-Object System.Windows.Automation.AndCondition($conditionParts)
    }
    $all += ConvertTo-WidexUiaArray $candidateRoot.FindAll($Scope, $condition)
  }
  @($all)
}

function Get-WidexElementIndex {
  param($Root)

  if (-not $Root) { throw "A UIA root is required to build an element index." }
  $index = @{}
  $elements = @(ConvertTo-WidexUiaArray $Root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    ))
  foreach ($element in $elements) {
    $automationId = $element.Current.AutomationId
    if ($automationId -and -not $index.ContainsKey($automationId)) {
      $index[$automationId] = $element
    }
  }
  $index
}

function Wait-WidexElement {
  param(
    [int]$ProcessId,
    $Root,
    [string]$AutomationId,
    [string]$Name,
    $ControlType,
    [int]$TimeoutSeconds = 15,
    [switch]$Disappear
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $element = Find-WidexElement -ProcessId $ProcessId -Root $Root -AutomationId $AutomationId -Name $Name -ControlType $ControlType
    if ($Disappear) {
      if (-not $element) { return $true }
    } elseif ($element) {
      return $element
    }
    Start-Sleep -Milliseconds 250
  } until ((Get-Date) -ge $deadline)

  if ($Disappear) { return $false }
  throw "Timed out waiting for UIA element. AutomationId='$AutomationId' Name='$Name'."
}

function Get-WidexMainWindowElement {
  param([int]$ProcessId, [int]$TimeoutSeconds = 15)

  Wait-WidexElement -ProcessId $ProcessId -AutomationId "CompassMainWindow" -TimeoutSeconds $TimeoutSeconds
}

function Show-WidexElementWindow {
  param($Element)

  if (-not $Element) { return $false }
  $handle = [IntPtr]$Element.Current.NativeWindowHandle
  if ($handle -eq [IntPtr]::Zero) { return $false }
  [void][WidexCompassGpsWin32]::ShowWindow($handle, 9)
  [WidexCompassGpsWin32]::SetForegroundWindow($handle)
}

function Invoke-WidexElement {
  param($Element, [string]$Description = "UIA element")

  if (-not $Element) { throw "$Description was not found." }

  $invoke = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern,
      [ref]$invoke
    )) {
    $invoke.Invoke()
    return "InvokePattern"
  }

  $selection = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$selection
    )) {
    $selection.Select()
    return "SelectionItemPattern"
  }

  throw "$Description does not support InvokePattern or SelectionItemPattern."
}

function Select-WidexElement {
  param($Element, [string]$Description = "UIA element")

  if (-not $Element) { throw "$Description was not found." }
  $selection = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$selection
    )) {
    $selection.Select()
    return "SelectionItemPattern"
  }

  Invoke-WidexElement -Element $Element -Description $Description
}

function Invoke-WidexElementWindowMessageClick {
  param(
    [int]$ProcessId,
    $Element,
    [string]$Description = "UIA element",
    [int]$WaitMilliseconds = 450
  )

  if (-not $Element) { throw "$Description was not found." }
  if (-not $Element.Current.IsEnabled) { throw "$Description is disabled." }
  if ($Element.Current.IsOffscreen) { throw "$Description is offscreen and cannot be clicked safely." }

  $main = Get-WidexMainWindowElement -ProcessId $ProcessId
  $handle = [IntPtr]$main.Current.NativeWindowHandle
  if ($handle -eq [IntPtr]::Zero) { throw "COMPASS GPS main window has no native handle." }

  try {
    $screenPoint = $Element.GetClickablePoint()
    $screenX = [int][Math]::Round($screenPoint.X)
    $screenY = [int][Math]::Round($screenPoint.Y)
  } catch {
    $rect = $Element.Current.BoundingRectangle
    if ($rect.IsEmpty -or [double]::IsInfinity($rect.X) -or [double]::IsInfinity($rect.Y)) {
      throw "$Description has no usable UIA clickable point or bounding rectangle."
    }
    $screenX = [int][Math]::Round($rect.Left + ($rect.Width / 2.0))
    $screenY = [int][Math]::Round($rect.Top + ($rect.Height / 2.0))
  }

  $clientPoint = New-Object WidexCompassGpsWin32+POINT
  $clientPoint.X = $screenX
  $clientPoint.Y = $screenY
  if (-not [WidexCompassGpsWin32]::ScreenToClient($handle, [ref]$clientPoint)) {
    throw "ScreenToClient failed for $Description."
  }

  $clientRect = New-Object WidexCompassGpsWin32+RECT
  if (-not [WidexCompassGpsWin32]::GetClientRect($handle, [ref]$clientRect)) {
    throw "GetClientRect failed for COMPASS GPS."
  }
  if ($clientPoint.X -lt $clientRect.Left -or $clientPoint.X -ge $clientRect.Right -or
      $clientPoint.Y -lt $clientRect.Top -or $clientPoint.Y -ge $clientRect.Bottom) {
    throw "$Description UIA point is outside the COMPASS GPS client area."
  }

  $packed = (($clientPoint.Y -band 0xffff) -shl 16) -bor ($clientPoint.X -band 0xffff)
  $lParam = [IntPtr]([int]$packed)
  [void][WidexCompassGpsWin32]::SendMessage($handle, 0x0200, [IntPtr]::Zero, $lParam)
  [void][WidexCompassGpsWin32]::SendMessage($handle, 0x0201, [IntPtr]1, $lParam)
  [void][WidexCompassGpsWin32]::SendMessage($handle, 0x0202, [IntPtr]::Zero, $lParam)
  Start-Sleep -Milliseconds $WaitMilliseconds
  "Win32WindowMessageClick"
}

function Invoke-WidexElementPointerClick {
  param(
    [int]$ProcessId,
    $Element,
    [string]$Description = "UIA element",
    [int]$WaitMilliseconds = 500
  )

  if (-not $Element) { throw "$Description was not found." }
  if (-not $Element.Current.IsEnabled) { throw "$Description is disabled." }
  if ($Element.Current.IsOffscreen) { throw "$Description is offscreen and cannot be clicked safely." }

  $main = Get-WidexMainWindowElement -ProcessId $ProcessId
  $handle = [IntPtr]$main.Current.NativeWindowHandle
  if ($handle -eq [IntPtr]::Zero) { throw "COMPASS GPS main window has no native handle." }
  [void][WidexCompassGpsWin32]::ShowWindow($handle, 9)
  [void][WidexCompassGpsWin32]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 200
  if ([WidexCompassGpsWin32]::GetForegroundWindow() -ne $handle) {
    throw "COMPASS GPS could not be brought to the foreground; refusing to send a pointer click."
  }

  try {
    $point = $Element.GetClickablePoint()
    $x = [int][Math]::Round($point.X)
    $y = [int][Math]::Round($point.Y)
  } catch {
    $rect = $Element.Current.BoundingRectangle
    if ($rect.IsEmpty -or [double]::IsInfinity($rect.X) -or [double]::IsInfinity($rect.Y)) {
      throw "$Description has no usable UIA clickable point or bounding rectangle."
    }
    $x = [int][Math]::Round($rect.Left + ($rect.Width / 2.0))
    $y = [int][Math]::Round($rect.Top + ($rect.Height / 2.0))
  }

  $original = New-Object WidexCompassGpsWin32+POINT
  $haveOriginal = [WidexCompassGpsWin32]::GetCursorPos([ref]$original)
  try {
    if (-not [WidexCompassGpsWin32]::SetCursorPos($x, $y)) {
      throw "SetCursorPos failed for $Description."
    }
    [WidexCompassGpsWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [WidexCompassGpsWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  } finally {
    if ($haveOriginal) {
      [void][WidexCompassGpsWin32]::SetCursorPos($original.X, $original.Y)
    }
  }

  Start-Sleep -Milliseconds $WaitMilliseconds
  "UIAResolvedWin32PointerClick"
}

function Get-WidexSelectionState {
  param($Element)

  if (-not $Element) { return $false }
  $selection = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$selection
    )) {
    return [bool]$selection.Current.IsSelected
  }
  $false
}

function Set-WidexValue {
  param($Element, [AllowNull()][string]$Value, [string]$Description = "UIA value")

  if (-not $Element) { throw "$Description was not found." }
  $valuePattern = $null
  if (-not $Element.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$valuePattern
    )) {
    throw "$Description does not support ValuePattern."
  }
  if ($valuePattern.Current.IsReadOnly) {
    throw "$Description is read-only."
  }
  $valuePattern.SetValue([string]$Value)
}

function Get-WidexValue {
  param($Element)

  if (-not $Element) { return $null }
  $valuePattern = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$valuePattern
    )) {
    return $valuePattern.Current.Value
  }
  $null
}

function Get-WidexElementTexts {
  param($Element)

  if (-not $Element) { return @() }
  $condition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::Text)

  @(
    ConvertTo-WidexUiaArray $Element.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $condition
    ) |
      ForEach-Object { $_.Current.Name } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Get-WidexComboSelection {
  param($ComboBox)

  if (-not $ComboBox) { return "" }
  $selection = $null
  if ($ComboBox.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionPattern]::Pattern,
      [ref]$selection
    )) {
    $selected = ConvertTo-WidexUiaArray $selection.Current.GetSelection()
    return (($selected | ForEach-Object { $_.Current.Name } | Where-Object { $_ }) -join "|")
  }
  Get-WidexValue $ComboBox
}

function Get-WidexComboOptions {
  param(
    [int]$ProcessId,
    $ComboBox,
    [int]$WaitMilliseconds = 400
  )

  if (-not $ComboBox) { throw "ComboBox was not found." }
  $expand = $null
  if (-not $ComboBox.TryGetCurrentPattern(
      [System.Windows.Automation.ExpandCollapsePattern]::Pattern,
      [ref]$expand
    )) {
    throw "ComboBox does not support ExpandCollapsePattern."
  }

  if ($expand.Current.ExpandCollapseState -ne [System.Windows.Automation.ExpandCollapseState]::Expanded) {
    $expand.Expand()
    Start-Sleep -Milliseconds $WaitMilliseconds
  }

  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $processCondition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ProcessIdProperty) `
    $ProcessId
  $typeCondition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::ListItem)
  $condition = New-Object System.Windows.Automation.AndCondition($processCondition, $typeCondition)
  $items = @(ConvertTo-WidexUiaArray $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition))

  try { $expand.Collapse() } catch {}
  @(
    foreach ($item in $items) {
      $selectionItem = $null
      if (-not $item.TryGetCurrentPattern(
          [System.Windows.Automation.SelectionItemPattern]::Pattern,
          [ref]$selectionItem
        )) {
        continue
      }

      $container = $selectionItem.Current.SelectionContainer
      if ($container -and [System.Windows.Automation.Automation]::Compare($container, $ComboBox)) {
        $item.Current.Name
      }
    }
  ) | Where-Object { $_ } | Select-Object -Unique
}

function Set-WidexComboSelection {
  param(
    [int]$ProcessId,
    $ComboBox,
    [string]$ItemName
  )

  if ((Get-WidexComboSelection $ComboBox) -eq $ItemName) {
    return "AlreadySet"
  }

  $expand = $null
  if (-not $ComboBox.TryGetCurrentPattern(
      [System.Windows.Automation.ExpandCollapsePattern]::Pattern,
      [ref]$expand
    )) {
    throw "ComboBox does not support ExpandCollapsePattern."
  }
  $expand.Expand()
  Start-Sleep -Milliseconds 400

  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $processCondition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ProcessIdProperty) `
    $ProcessId
  $nameCondition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::NameProperty) `
    $ItemName
  $typeCondition = New-WidexUiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) `
    ([System.Windows.Automation.ControlType]::ListItem)
  $condition = New-Object System.Windows.Automation.AndCondition($processCondition, $nameCondition, $typeCondition)
  $matches = @(ConvertTo-WidexUiaArray $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition))

  $item = $null
  foreach ($candidate in $matches) {
    $selection = $null
    if ($candidate.TryGetCurrentPattern(
        [System.Windows.Automation.SelectionItemPattern]::Pattern,
        [ref]$selection
      )) {
      $container = $selection.Current.SelectionContainer
      if ($container -and [System.Windows.Automation.Automation]::Compare($container, $ComboBox)) {
        $item = $candidate
        break
      }
    }
  }

  if (-not $item) {
    try { $expand.Collapse() } catch {}
    $available = Get-WidexComboOptions -ProcessId $ProcessId -ComboBox $ComboBox
    throw "ComboBox item '$ItemName' was not found. Available: $($available -join ', ')"
  }

  $pattern = $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
  $pattern.Select()
  Start-Sleep -Milliseconds 350
  $actual = Get-WidexComboSelection $ComboBox
  if ($actual -ne $ItemName) {
    throw "ComboBox selection verification failed. Expected='$ItemName' Actual='$actual'."
  }
  "SelectionItemPattern"
}

function Resolve-WidexCompassGpsExecutable {
  param(
    [string]$CompassPath = $script:WidexCompassGpsDefaultExe,
    [string]$ShortcutPath = $script:WidexCompassGpsDefaultShortcut
  )

  if ($CompassPath -and (Test-Path -LiteralPath $CompassPath -PathType Leaf)) {
    return (Get-Item -LiteralPath $CompassPath).FullName
  }

  if ($ShortcutPath -and (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    if ($shortcut.TargetPath -and (Test-Path -LiteralPath $shortcut.TargetPath -PathType Leaf)) {
      return (Get-Item -LiteralPath $shortcut.TargetPath).FullName
    }
  }

  throw "COMPASS GPS executable was not found. CompassPath='$CompassPath' ShortcutPath='$ShortcutPath'."
}
