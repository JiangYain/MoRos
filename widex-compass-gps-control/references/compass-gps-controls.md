# Widex COMPASS GPS 4.9 UIA control reference

## Contents

1. [Validated environment](#validated-environment)
2. [Window hierarchy](#window-hierarchy)
3. [Credential dialog](#credential-dialog)
4. [Main shell and navigation](#main-shell-and-navigation)
5. [Connection controls](#connection-controls)
6. [Session-start menu](#session-start-menu)
7. [Session overview](#session-overview)
8. [Stand-alone patient browser](#stand-alone-patient-browser)
9. [Patient details dialog](#patient-details-dialog)
10. [Automation strategy](#automation-strategy)
11. [Known boundaries](#known-boundaries)

## Validated environment

- Shortcut: `C:\Users\Public\Desktop\COMPASS GPS.lnk`
- Executable: `C:\Program Files (x86)\Widex\CompassGPS\Compass.exe`
- Product: `COMPASS GPS`
- Company: `WIDEX A/S`
- Product/file version: `4.9.6365.0`
- Observed UI language: Simplified Chinese
- Technology: WPF/.NET with Microsoft UI Automation exposure
- Stand-alone database components are installed beside the main program:
  - `CompassGPSDBGUI.exe`
  - `CompassGPSDBService.exe`
  - `CompassGPSDBControlLibrary.dll`

The GPS process can expose a blank `MainWindowTitle` through `Get-Process` even while its UIA top-level window is visible. Use `AutomationId=CompassMainWindow`, not `Process.MainWindowTitle`, as the primary identity check.

## Window hierarchy

Observed UIA hierarchy after logging on with the stand-alone database:

```text
Compass.exe process
├─ Window AutomationId=CompassMainWindow Name="WIDEX COMPASS GPS"
│  ├─ main navigation, connection bar, workspace
│  └─ Window AutomationId=PatientBrowserView.Dialog
│     └─ Window AutomationId=PatientDetails.Dialog (when editing/creating)
└─ Window AutomationId=TheDialog (credential stage before main shell)
```

Owned dialogs can appear as descendants of the main window instead of independent process main windows. Search all top-level UIA windows for the GPS process, then search each root's descendants.

## Credential dialog

Root window:

| Purpose | UIA selector | Notes |
|---|---|---|
| Credential window | `ControlType.Window`, `AutomationId=TheDialog` | Title can be empty; identify by AutomationId and process. |
| Initials | `AutomationId=Widex.Compass.Gui.Application.LogOn.Initials`, `ControlType.Edit` | Observed local initials were already populated; do not record actual credentials in the skill. |
| Password | `AutomationId=Widex.Compass.Gui.Application.LogOn.Password`, `ControlType.Edit` | Password text is sensitive. Do not accept it as a command-line parameter or log its value. |
| Remember credentials | `AutomationId=Widex.Compass.Gui.Application.LogOn.RememberCredentials`, `ControlType.CheckBox` | Do not change without explicit authorization. |
| Log on | `AutomationId=Widex.Compass.Gui.Application.LogOn.Logon`, `ControlType.Button` | Chinese visible name appeared as `注册`; AutomationId is authoritative. |
| Close | `AutomationId=Widex.Compass.Gui.Application.LogOn.Close`, `ControlType.Button` | Closes GPS; do not invoke during automation setup. |

`open-compass-gps.ps1 -LogOnWithRememberedCredentials` invokes only the existing enabled logon button. It does not read, reveal, or set the password.

## Main shell and navigation

Main root:

| Purpose | AutomationId | Control type |
|---|---|---|
| GPS main window | `CompassMainWindow` | Window |
| Application frame | `defaultframe` | Custom |
| Global scroller | `GlobalScroller` | Pane |
| Workspace layout | `DefaultLayout` | Custom |
| Workspace | `Widex.Compass.Platform.Modules.DefaultLayoutView.WorkspaceControl` | Custom |
| Alternate fitting workspace | `Widex.Compass.Platform.Modules.DefaultLayoutView.WorkspaceControlFT` | Custom |

Top navigation:

| Visible page | AutomationId | Notes |
|---|---|---|
| 会话启动 / Start session | `TopNavigation.StartSession` | Disabled until the required client/session state is present. |
| 选择 / Selection | `TopNavigation.Selection` | Fitting workflow page. |
| 选配 / Fitting | `TopNavigation.Fitting` | Fitting workflow page. |
| 微调 / Fine tuning | `TopNavigation.Finetuning` | Fitting workflow page. |
| 登录 / Logging | `TopNavigation.Logging` | The Chinese label is the product localization, not the credential dialog. |
| 操作 / Handling | `TopNavigation.Handling` | Fitting workflow page. |
| 结束 / Close | `TopNavigation.Close` | Can end a session; do not invoke without explicit authorization. |

Global toolbar:

| Purpose | AutomationId | Notes |
|---|---|---|
| Save | `topIconSave` | Disabled when no pending changes. Requires explicit save confirmation. |
| Print | `topIconPrint` | Printing is outside the default automation scope. |
| Help | `topIconHelp` | May open help content. |
| PPI | `topIconPPI` | Exact product behavior not yet validated. |
| Player | `topIconPlayer` | Exact media behavior not yet validated. |
| Close session presenter | `FrameGlobalNavigationClose` | Contains `TopNavigation.Close`. |

## Connection controls

Connection container and stable controls:

| Purpose | AutomationId | Notes |
|---|---|---|
| Connection container | `ConnectDisconnect` | Contains programming interface and connect/disconnect state. |
| Programming device | `Widex.Compass.Platform.Modules.ConnectDisconnect.ProgrammingInterfaceView.ProgrammingDevice` | ComboBox; enumerate live item names before selecting. |
| Connect | `Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.ConnectBtn` | Duplicate UIA nodes can exist; select an enabled button. |
| Disconnect | `Widex.Compass.Platform.Modules.ConnectDisconnect.ConnectDisconnectView.DisconnectBtn` | Disabled when no hearing aids are connected. |
| Connection status | `ConnectionStatus` | Read descendant texts and enabled states after an action. |
| Status messages | `StatusMessages` | Observed text `0` without devices; do not infer connection from it alone. |
| Right battery | `RightBatteryStatusMessage` | Read-only container. |
| Left battery | `LeftBatteryStatusMessage` | Read-only container. |
| Right mute | `Widex.Compass.Tiger.Modules.Reusable.MuteUnmute.Right` | Contains a disabled/active checkbox depending on device state. |
| Left mute | `Widex.Compass.Tiger.Modules.Reusable.MuteUnmute.Left` | Contains a disabled/active checkbox depending on device state. |

Connection actions may communicate with real hearing aids. Require an explicit user confirmation and the script's `-ConfirmDeviceAction` guard.

## Session-start menu

Container: `AutomationId=StartSessionMenu`.

| Visible page | AutomationId | Risk |
|---|---|---|
| 总结 / Overview | `StartSessionMenuOverview` | Read-oriented overview. |
| 测听 / Audiometry | `FittingMenuPrecondition` | May expose or edit hearing thresholds. |
| 固件升级 | `StartSessionMenuFirmwareCommonUpdate` | Can modify device firmware; never invoke implicitly. |
| 转移设置 | `StartSessionMenuImportSettings` | Can transfer fitting settings; explicit authorization required. |
| 质量保证 | `StartSessionMenuQualityAssurance` | Can trigger device/test workflows. |
| 客户隐私 | `StartSessionMenuFirmwareUpdate` | The AutomationId is misleading; visible label and page readback are required. |
| COMPASS安装 / Setup | `StartSessionMenuSetup` | Product installation/preferences page. |

The `客户隐私` item using an AutomationId containing `FirmwareUpdate` is a confirmed product quirk. Never map pages by AutomationId semantics alone; preserve the validated visible-name mapping.

## Session overview

Observed overview root:

| Purpose | UIA selector | Notes |
|---|---|---|
| Overview view | `AutomationId=SessionOverviewView` | ViewModel name is exposed as the accessible name. |
| Right audiogram graph | `AutomationId=curvecontrolright` | Screen-side/right-ear relationship must be revalidated before writing. |
| Left audiogram graph | `AutomationId=curvecontrolleft2` | Screen-side/left-ear relationship must be revalidated before writing. |
| Connect to hearing aids | visible button name `连接到助听器` | No stable AutomationId observed in the initial tree. Prefer the connection-bar ID instead. |
| Firmware prompt | visible button name `更新 PRO LINK 固件` | Do not invoke automatically. |
| Latest information | visible button name `最新信息` | May open external/help content. |
| Start guide | visible button name `启动向导` | Read-only guidance path; page behavior not yet validated. |
| Manual | visible button name `COMPASS手册` | May open a local PDF/help viewer. |

The initial overview reported no detected hearing aids. Graph axes displayed 125, 250, 500, 1k, 2k, 4k, and 8k from 0/20 through 120 dB HL. No write pattern has yet been accepted as validated; do not implement audiogram writes solely from these visible axes.

## Stand-alone patient browser

Root: `AutomationId=PatientBrowserView.Dialog`.

| Purpose | AutomationId | Notes |
|---|---|---|
| Browser view | `PatientBrowserView` | Main content under the dialog. |
| New client | `Widex.Compass.PatientBrowser.NewPatient` | Description exposed as `增加新客户`. |
| Edit client | `Widex.Compass.PatientBrowser.EditPatient` | Disabled until a client is selected. |
| Delete client | `Widex.Compass.PatientBrowser.DeletePatient` | Never invoke automatically. |
| Search text | `Widex.Compass.PatientBrowser.SearchText` | Supports `ValuePattern`. |
| Search | `Widex.Compass.PatientBrowser.Search` | Invoke after setting search text. |
| Quick guide | `Widex.Compass.PatientBrowser.ShowQuickGuide` | Opens help/guide content. |
| Client list | `PatientList` | ListView; enumerate visible ListItem/DataItem descendants. |
| Select client | `Widex.Compass.PatientBrowser.SelectPatient` | Opens/accepts the selected client. |
| Session list | `Widex.Compass.PatientBrowser.SessionList` | Read sessions only after selecting the intended client. |
| Enter audiogram | `Widex.Compass.PatientBrowser.EnterAudiogram` | Disabled without a selected client. |
| Comments | `Widex.Compass.PatientBrowser.Comments` | Disabled without a selected client. |
| Latest right device | `Widex.Compass.PatientBrowser.LatestDevices.RightHa` | Read-only. |
| Right serial number | `Widex.Compass.PatientBrowser.LatestDevices.RightSerialNumber` | Sensitive device identifier; do not publish. |
| Latest left device | `Widex.Compass.PatientBrowser.LatestDevices.LeftHa` | Read-only. |
| Left serial number | `Widex.Compass.PatientBrowser.LatestDevices.LeftSerialNumber` | Sensitive device identifier; do not publish. |
| DEX names | `Widex.Compass.PatientBrowser.LatestDevices.DexNames` | Read-only. |
| DEX serial numbers | `Widex.Compass.PatientBrowser.LatestDevices.DexSerialNumbers` | Sensitive device identifier; do not publish. |

The initial local client list appeared empty. Do not treat an empty screenshot as proof; use the UIA list count.

## Patient details dialog

Root: `AutomationId=PatientDetails.Dialog`.

Core fields:

| Field | AutomationId |
|---|---|
| Title | `Widex.Compass.PatientDetails.Title` |
| First name | `Widex.Compass.PatientDetails.FirstName` |
| Middle name | `Widex.Compass.PatientDetails.MiddleName` |
| Last name | `Widex.Compass.PatientDetails.LastName` |
| Date of birth | `Widex.Compass.PatientDetails.DateOfBirth` |
| Date text child | `DatePickerTextBox` |
| Gender | `Widex.Compass.PatientDetails.Gender` |
| Primary phone | `Widex.Compass.PatientDetails.PrimaryPhone` |
| Secondary phone | `Widex.Compass.PatientDetails.SecondaryPhone` |
| Email | `Widex.Compass.PatientDetails.Email` |
| Comments | `Widex.Compass.PatientDetails.Comments` |

Additional fields:

| Field | AutomationId |
|---|---|
| Address 1 | `Widex.Compass.PatientDetails.Address1` |
| Address 2 | `Widex.Compass.PatientDetails.Address2` |
| Address 3 | `Widex.Compass.PatientDetails.Address3` |
| City | `Widex.Compass.PatientDetails.City` |
| State | `Widex.Compass.PatientDetails.State` |
| ZIP/postal code | `Widex.Compass.PatientDetails.Zip` |
| Country | `Widex.Compass.PatientDetails.Country` |
| Occupation | `Widex.Compass.PatientDetails.Occupation` |
| Physician | `Widex.Compass.PatientDetails.Physican` |
| Referral | `Widex.Compass.PatientDetails.Referal` |
| Insurance | `Widex.Compass.PatientDetails.Insurance1` |
| Insurance number | `Widex.Compass.PatientDetails.InsuranceNo` |
| Social security number | `Widex.Compass.PatientDetails.SocSecNo` |
| Fax | `Widex.Compass.PatientDetails.Fax` |

Product spelling quirks are part of the stable AutomationIds: `Physican` and `Referal` are intentionally preserved.

Dialog buttons:

| Purpose | AutomationId | Notes |
|---|---|---|
| Confirm | `Ok` | Disabled until required fields are acceptable. Saving creates or updates a database record. |
| Cancel | `Cancel` | Use for fill validation without creating a record. |

## Automation strategy

1. Find the `Compass.exe` process by the exact installed executable path.
2. Enumerate desktop UIA child windows by `ProcessId`.
3. Identify stages by stable root AutomationIds:
   - `TheDialog`
   - `CompassMainWindow`
   - `PatientBrowserView.Dialog`
   - `PatientDetails.Dialog`
4. Prefer `AutomationId` over localized names.
5. Prefer UIA patterns:
   - `ValuePattern` for text fields
   - `SelectionItemPattern` for tabs, rows, and ComboBox items
   - `InvokePattern` for buttons
   - `ExpandCollapsePattern` plus `SelectionPattern` for ComboBoxes
6. After any page transition, reacquire the root and target element before verification.
7. Verify selected states, enabled states, values, or dialog disappearance. Do not rely on successful method return alone.
8. Use Win32 only for launch, focus, window layout, and screen capture.

## Known boundaries

- The current reference is specific to COMPASS GPS 4.9.6365.0 in Simplified Chinese.
- Client, session, and device data can contain sensitive medical and hardware identifiers. Keep diagnostic output minimal and redact before sharing.
- Computer Use was effective for visual discovery but unreliable for text entry into owned WPF dialogs. The delivered skill does not depend on Computer Use.
- Audiogram editing, language selection, deep fitting pages, session creation/opening, and individual device programming still require dedicated forward validation before write scripts should be trusted.
- The visible Chinese label `登录` in top navigation is a fitting workflow label, not the local database credential dialog.
- Duplicate UIA nodes can exist for connect controls. Select the enabled actionable node and verify afterward.
- Coordinate automation is deliberately excluded from client, navigation, and device scripts. Add coordinates only when a control is proven not to expose a usable UIA Pattern and pair them with a stable bounding-rectangle calibration and readback.
