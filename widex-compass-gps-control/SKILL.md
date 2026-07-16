---
name: widex-compass-gps-control
description: "Prepare, inspect, and control Widex COMPASS GPS 4.9 on Windows through PowerShell and Microsoft UI Automation. Use when Compass needs to launch or log on to the local COMPASS GPS stand-alone database, arrange the Compass and GPS windows, inspect the current fitting state, list or create clients, select a client, navigate GPS pages, choose a programming interface, inspect or initiate hearing-aid connection, save a fitting session, capture the GPS UI, or export the GPS UIA tree for diagnosis."
---

# Widex COMPASS GPS Control

## Purpose

Control the installed Widex COMPASS GPS 4.9 application with deterministic PowerShell scripts. Use Microsoft UI Automation and Win32 only. Do not use Computer Use, image recognition, Windows Search, the Start menu, or the Run dialog while applying this skill.

The validated installation is:

```text
C:\Program Files (x86)\Widex\CompassGPS\Compass.exe
Product version: 4.9.6365.0
Main window: Name="WIDEX COMPASS GPS", AutomationId="CompassMainWindow"
```

Read `references/compass-gps-controls.md` when diagnosing a missing control, extending a script, or working on a page not covered by the quick commands.

## Safety contract

- Treat COMPASS GPS clients as a separate database from Compass client profiles. Match the intended client explicitly before opening or saving a session.
- Never delete a client, session, fitting, or local database record automatically.
- Never enter real personal or medical data unless the user explicitly provides and authorizes those exact values.
- Create a client only with `create-compass-gps-client.ps1 -Save`; omit `-Save` or use `-CancelAfterFill` for validation.
- Connect or disconnect real hearing aids only after confirming the intended client, devices, and programming interface; the script additionally requires `-ConfirmDeviceAction`.
- Save fitting changes only after the user confirms the active client and pending changes; the script additionally requires `-ConfirmSave`.
- Do not invoke firmware update, transfer, quality-assurance mutation, privacy submission, printing, or session close unless the user explicitly requests that operation.
- Stop if the expected window, dialog, enabled state, or readback is missing. Do not continue with coordinate guessing.

## Quick start

Launch GPS and stop at the credential dialog if login is required:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\open-compass-gps.ps1"
```

Use already remembered local credentials only when the user asked to open and enter GPS:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\open-compass-gps.ps1" -LogOnWithRememberedCredentials
```

Successful outcomes:

- `Status=Ready`: the main GPS window exists.
- `Status=LoginRequired`: the local credential dialog exists; do not invent or request a password through command-line arguments.
- `Status=StartedNoRecognizedWindow`: report the process ID and inspect the UIA tree.

Arrange Compass on the left and GPS on the right:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\arrange-compass-widex-gps.ps1"
```

The default split is `30% Compass / 70% GPS`. Treat `Status=Arranged`, both width checks, and `SeamOk=True` as success.

## Inspect before acting

Read the current application, dialog, navigation, connection, and save state:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\get-compass-gps-state.ps1"
```

Read programming-interface and connection state only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\get-compass-gps-connection-state.ps1"
```

Export a diagnostic UIA tree when a control cannot be found:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\export-compass-gps-uia-tree.ps1" -ControlView
```

Use `-OutputPath` for a specific destination. The default writes a timestamped file under this skill's `references` directory.

## Navigate GPS

List the stable page names:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\switch-compass-gps-page.ps1" -ListAvailable
```

Switch a main fitting tab:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\switch-compass-gps-page.ps1" -MainTab Fitting
```

Switch a session-start page:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\switch-compass-gps-page.ps1" -StartPage Setup
```

Use `-DryRun` to validate names and enabled state without changing pages. A fitting-session main tab can remain disabled until a client/session is selected.

## Work with clients

Read the visible stand-alone database client list:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\get-compass-gps-client-list.ps1"
```

Fill a synthetic or user-authorized client and cancel without creating it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\create-compass-gps-client.ps1" -FirstName "Automation" -LastName "WidexTest" -BirthDate "1990/01/01" -CancelAfterFill
```

Create a client only after explicit authorization:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\create-compass-gps-client.ps1" -FirstName "<first>" -LastName "<last>" -BirthDate "<date>" -Save
```

The script supports optional contact, address, insurance, physician, referral, occupation, gender, fax, and comments fields. Only explicitly supplied optional fields are overwritten.

Search, select, and open one exact client:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\open-compass-gps-client.ps1" -FirstName "<first>" -LastName "<last>"
```

Use `-SelectOnly` to select the row without invoking the `SelectPatient` action. Stop if zero or multiple rows match.

## Programming interface and hearing aids

List available programming devices without selecting one:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\set-compass-gps-programming-device.ps1" -ListAvailable
```

Select a device after reviewing the returned names:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\set-compass-gps-programming-device.ps1" -DeviceName "<exact UIA item name>"
```

Connect only after confirmation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\connect-compass-gps-hearing-aids.ps1" -ConfirmDeviceAction
```

Disconnect only after confirmation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\connect-compass-gps-hearing-aids.ps1" -Disconnect -ConfirmDeviceAction
```

The connection script verifies only that the command was invoked and reports the enabled states afterward. Do not claim that hearing aids are connected without a positive connection-state or device readback.

## Save and capture

Save the current fitting session only after confirmation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\save-compass-gps-session.ps1" -ConfirmSave
```

Capture the main GPS window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\capture-compass-gps-view.ps1"
```

Capture a recognized foreground GPS dialog:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\widex-compass-gps-control\scripts\capture-compass-gps-view.ps1" -CaptureTarget ForegroundDialog
```

Treat `Status=Captured` plus the returned `OutputPath`, dimensions, window title, and AutomationId as success.

## Failure handling

- If the shortcut exists but the executable is missing, report both resolved paths and stop.
- If the process runs without `CompassMainWindow` or `TheDialog`, export the UIA tree and report the unrecognized top-level windows.
- If `PatientBrowserView.Dialog` is absent, ensure GPS is logged into the stand-alone database before client actions.
- If a client selector matches multiple rows, ask for a more specific name or client ID. Do not choose the first row.
- If a ComboBox item is missing, run the corresponding `-ListAvailable` path and use the exact returned UIA item name.
- If a button is disabled, report the required state instead of clicking by coordinates.
- If UI labels or AutomationIds differ after a GPS update, record the installed product version and refresh `references/compass-gps-controls.md` before changing scripts.
