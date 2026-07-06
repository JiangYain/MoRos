param(
  [string]$LanguageCode = "zh-CN",
  [string]$TargetTitlePattern = "Phonak Target 12\.0",
  [int]$TimeoutSeconds = 15,
  [switch]$ListAvailable
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PhonakTargetLanguageWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
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

function Find-UiaFirstByAutomationId {
  param($Root, [string]$AutomationId)

  $condition = New-UiaPropertyCondition `
    ([System.Windows.Automation.AutomationElement]::AutomationIdProperty) `
    $AutomationId

  $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Select-UiaElement {
  param($Element)

  $selectionItemPattern = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$selectionItemPattern
    )) {
    $selectionItemPattern.Select()
    return "SelectionItemPattern"
  }

  $invokePattern = $null
  if ($Element.TryGetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern,
      [ref]$invokePattern
    )) {
    $invokePattern.Invoke()
    return "InvokePattern"
  }

  throw "Element does not support SelectionItemPattern or InvokePattern."
}

function Get-ComboBoxSelectedText {
  param($ComboBox)

  $selectionPattern = $null
  if ($ComboBox.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionPattern]::Pattern,
      [ref]$selectionPattern
    )) {
    $selectedItems = ConvertTo-UiaArray $selectionPattern.Current.GetSelection()
    if ($selectedItems.Count -gt 0) {
      return $selectedItems[0].Current.Name
    }
  }

  $textElements = Find-UiaDescendantsByType $ComboBox ([System.Windows.Automation.ControlType]::Text)
  (($textElements | ForEach-Object { $_.Current.Name } | Where-Object { $_ }) -join " | ")
}

function Test-UiaAncestorClass {
  param($Element, [string]$ClassName)

  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $current = $Element

  for ($i = 0; $i -lt 10; $i++) {
    $current = $walker.GetParent($current)
    if ($null -eq $current) {
      return $false
    }

    if ($current.Current.ClassName -eq $ClassName) {
      return $true
    }
  }

  $false
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

function Open-FittingLanguagePage {
  param($TargetProcess)

  [void][PhonakTargetLanguageWin32]::ShowWindow($TargetProcess.MainWindowHandle, 9)
  [void][PhonakTargetLanguageWin32]::SetForegroundWindow($TargetProcess.MainWindowHandle)
  Start-Sleep -Milliseconds 300

  $root = [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
  $homeTab = Find-UiaFirstByAutomationId $root "Home.HomeTabControl"
  if (-not $homeTab) {
    throw "Home.HomeTabControl not found."
  }

  $bottomTabs = @(
    Find-UiaChildrenByType $homeTab ([System.Windows.Automation.ControlType]::TabItem) |
      Sort-Object { $_.Current.BoundingRectangle.Left }
  )

  if ($bottomTabs.Count -lt 6) {
    throw "Expected at least 6 home bottom tabs, found $($bottomTabs.Count)."
  }

  [void](Select-UiaElement $bottomTabs[5])
  Start-Sleep -Milliseconds 700

  $root = [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
  $preferencesTab = Find-UiaFirstByAutomationId $root "Home.Preferences.PreferencesTabControl"
  if (-not $preferencesTab) {
    throw "Home.Preferences.PreferencesTabControl not found."
  }

  $topTabs = @(
    Find-UiaChildrenByType $preferencesTab ([System.Windows.Automation.ControlType]::TabItem) |
      Sort-Object { $_.Current.BoundingRectangle.Left }
  )

  if ($topTabs.Count -lt 1) {
    throw "Preferences top tabs not found."
  }

  [void](Select-UiaElement $topTabs[0])
  Start-Sleep -Milliseconds 700

  $root = [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
  $nestedTabs = @(
    Find-UiaDescendantsByType $root ([System.Windows.Automation.ControlType]::Tab) |
      Where-Object {
        $_.Current.AutomationId -eq "" -and
        $_.Current.BoundingRectangle.Width -gt 1000 -and
        $_.Current.BoundingRectangle.Top -gt $preferencesTab.Current.BoundingRectangle.Top
      } |
      Sort-Object { $_.Current.BoundingRectangle.Top }
  )

  if ($nestedTabs.Count -lt 1) {
    throw "General preferences category tab control not found."
  }

  $categoryTabs = @(
    Find-UiaChildrenByType $nestedTabs[0] ([System.Windows.Automation.ControlType]::TabItem) |
      Sort-Object { $_.Current.BoundingRectangle.Top }, { $_.Current.BoundingRectangle.Left }
  )

  if ($categoryTabs.Count -lt 1) {
    throw "General preferences category tabs not found."
  }

  [void](Select-UiaElement $categoryTabs[0])
  Start-Sleep -Milliseconds 700

  [System.Windows.Automation.AutomationElement]::FromHandle($TargetProcess.MainWindowHandle)
}

function Get-FittingSoftwareLanguageComboBox {
  param($Root)

  $comboBoxes = @(
    Find-UiaDescendantsByType $Root ([System.Windows.Automation.ControlType]::ComboBox) |
      Where-Object {
        -not $_.Current.IsOffscreen -and
        $_.Current.BoundingRectangle.Width -gt 100
      } |
      Sort-Object { $_.Current.BoundingRectangle.Top }, { $_.Current.BoundingRectangle.Left }
  )

  if ($comboBoxes.Count -lt 1) {
    throw "Fitting software language ComboBox not found."
  }

  $comboBoxes[0]
}

function Expand-ComboBox {
  param($ComboBox)

  $expandPattern = $null
  if (-not $ComboBox.TryGetCurrentPattern(
      [System.Windows.Automation.ExpandCollapsePattern]::Pattern,
      [ref]$expandPattern
    )) {
    throw "ComboBox does not support ExpandCollapsePattern."
  }

  if ($expandPattern.Current.ExpandCollapseState -ne [System.Windows.Automation.ExpandCollapseState]::Expanded) {
    $expandPattern.Expand()
    Start-Sleep -Milliseconds 800
  }

  $expandPattern
}

function Get-TargetListItemsByName {
  param($TargetProcess, [string]$Name)

  Find-UiaDescendantsByType `
    ([System.Windows.Automation.AutomationElement]::RootElement) `
    ([System.Windows.Automation.ControlType]::ListItem) |
    Where-Object {
      $_.Current.ProcessId -eq $TargetProcess.Id -and
      $_.Current.Name -eq $Name
    }
}

function Get-AvailableTargetListItemNames {
  param($TargetProcess)

  Find-UiaDescendantsByType `
    ([System.Windows.Automation.AutomationElement]::RootElement) `
    ([System.Windows.Automation.ControlType]::ListItem) |
    Where-Object {
      $_.Current.ProcessId -eq $TargetProcess.Id -and
      $_.Current.Name
    } |
    ForEach-Object { $_.Current.Name } |
    Select-Object -Unique
}

function Click-UiaElementCenter {
  param($Element)

  $rect = $Element.Current.BoundingRectangle
  $x = [int]($rect.Left + ($rect.Width / 2))
  $y = [int]($rect.Top + ($rect.Height / 2))

  [void][PhonakTargetLanguageWin32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 100
  [PhonakTargetLanguageWin32]::mouse_event(
    [PhonakTargetLanguageWin32]::MOUSEEVENTF_LEFTDOWN,
    0,
    0,
    0,
    [UIntPtr]::Zero
  )
  Start-Sleep -Milliseconds 60
  [PhonakTargetLanguageWin32]::mouse_event(
    [PhonakTargetLanguageWin32]::MOUSEEVENTF_LEFTUP,
    0,
    0,
    0,
    [UIntPtr]::Zero
  )

  "MouseClick"
}

function Set-FittingSoftwareLanguage {
  param($TargetProcess, $ComboBox, [string]$Code)

  $expandPattern = Expand-ComboBox $ComboBox
  $items = @(Get-TargetListItemsByName -TargetProcess $TargetProcess -Name $Code)

  if ($items.Count -lt 1) {
    $available = (Get-AvailableTargetListItemNames -TargetProcess $TargetProcess) -join ", "
    throw "Language '$Code' not found in Target dropdown. Available values: $available"
  }

  $selectionItem = $items |
    Where-Object {
      $pattern = $null
      $_.TryGetCurrentPattern(
        [System.Windows.Automation.SelectionItemPattern]::Pattern,
        [ref]$pattern
      )
    } |
    Select-Object -First 1

  if ($selectionItem) {
    $scrollItemPattern = $null
    if ($selectionItem.TryGetCurrentPattern(
        [System.Windows.Automation.ScrollItemPattern]::Pattern,
        [ref]$scrollItemPattern
      )) {
      $scrollItemPattern.ScrollIntoView()
      Start-Sleep -Milliseconds 200
    }

    $selectionPattern = $null
    [void]$selectionItem.TryGetCurrentPattern(
      [System.Windows.Automation.SelectionItemPattern]::Pattern,
      [ref]$selectionPattern
    )
    $selectionPattern.Select()
    return "SelectionItemPattern"
  }

  $clickTarget = @($items | Where-Object { Test-UiaAncestorClass $_ "Popup" }) | Select-Object -First 1
  if (-not $clickTarget) {
    $clickTarget = $items | Select-Object -First 1
  }

  if ($expandPattern.Current.ExpandCollapseState -ne [System.Windows.Automation.ExpandCollapseState]::Expanded) {
    [void](Expand-ComboBox $ComboBox)
  }

  Click-UiaElementCenter $clickTarget
}

$targetProcess = Wait-TargetMainWindowProcess `
  -TitlePattern $TargetTitlePattern `
  -Timeout $TimeoutSeconds

$root = Open-FittingLanguagePage -TargetProcess $targetProcess
$comboBox = Get-FittingSoftwareLanguageComboBox -Root $root
$previousLanguage = Get-ComboBoxSelectedText $comboBox

$expandPatternForList = $null
if ($ListAvailable) {
  $expandPatternForList = Expand-ComboBox $comboBox
  $availableLanguages = @(Get-AvailableTargetListItemNames -TargetProcess $targetProcess)
  if ($expandPatternForList.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Expanded) {
    $expandPatternForList.Collapse()
  }

  [pscustomobject]@{
    Status = "AvailableLanguages"
    TargetProcessId = $targetProcess.Id
    CurrentLanguage = $previousLanguage
    Languages = ($availableLanguages -join ", ")
  } | Format-List
  return
}

$method = "AlreadySet"
if ($previousLanguage -ne $LanguageCode) {
  $method = Set-FittingSoftwareLanguage `
    -TargetProcess $targetProcess `
    -ComboBox $comboBox `
    -Code $LanguageCode
  Start-Sleep -Milliseconds 1200
}

$root = [System.Windows.Automation.AutomationElement]::FromHandle($targetProcess.MainWindowHandle)
$comboBox = Get-FittingSoftwareLanguageComboBox -Root $root
$currentLanguage = Get-ComboBoxSelectedText $comboBox

$status = if ($currentLanguage -eq $LanguageCode) {
  if ($previousLanguage -eq $LanguageCode) { "AlreadySet" } else { "Changed" }
} else {
  "NotVerified"
}

[pscustomobject]@{
  Status = $status
  TargetProcessId = $targetProcess.Id
  PreviousLanguage = $previousLanguage
  CurrentLanguage = $currentLanguage
  RequestedLanguage = $LanguageCode
  Method = $method
} | Format-List
