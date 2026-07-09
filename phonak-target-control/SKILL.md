---
name: phonak-target-control
description: "用于准备和控制 Phonak Target 的行动指南，面向 CLI 驱动的 Microsoft UI Automation 工作。Use when Compass 需要打开内部 Phonak Target 可执行文件、等待 Phonak Target 12.0 主窗口出现、把 Compass 放在较窄左侧约 25.4% 并把 Target 放在较宽右侧约 74.6%、快速切换验配软件语言、新建顾客、打开指定顾客或会话、快速切换验配会话主 Tab 与子 Tab、设置顾客详情页用户同意/数据储存同意、快速输入左右耳 AC/BC/UCL 听力图、快速选择左右耳听力图测量条件、截取 Target 验配界面、打开 Palio Studio，或在 Target UI 自动化实验前建立稳定桌面布局。"
---

# Phonak Target Control

## 目标

在通过 Microsoft UI Automation 或其他 CLI 自动化方式控制 Phonak Target 之前，先使用这个 Skill 完成桌面准备。

这个 Skill 固化十一个常用操作：

1. 打开内部版 Target 可执行文件，并等待主窗口标题变为 `Phonak Target 12.0`。
2. 按当前验证过的工作比例排列窗口：Compass 使用左侧较小区域，约占工作区宽度 `25.4%`；Target 使用右侧较大区域，约占工作区宽度 `74.6%`。完成后用 DWM 可见边界验证坐标。
3. 快速切换验配软件语言。
4. 通过 Microsoft UI Automation 快速新建顾客。
5. 直接打开当前 Target 版本对应的 Palio Studio。
6. 打开指定顾客/会话：有会话时选中会话并点 `打开界面`；没有会话时双击客户行进入。
7. 只截取 Target 当前验配窗口并保存为 PNG。
8. 在当前验配听力图页快速写入患者左/右耳 AC/BC/UCL 听力图点，并读回 XML 验证。
9. 在当前验配听力图页快速选择患者左/右耳听力图测量条件。
10. 在当前验配会话中快速切换 `顾客`、`设备`、`验配` 主 Tab 及其子 Tab。
11. 在顾客详情页快速设置用户同意/数据储存同意，并读回单选状态验证。

## 快速开始

在 PowerShell 中依次运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-target.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\arrange-compass-target.ps1"
```

预期结果：

- `open-target.ps1` 输出 `Ready`，并显示 Target 进程 ID 与主窗口标题。
- `arrange-compass-target.ps1` 输出 `AppliedLayoutRatio=Compass=25.4% Target=74.6%` 附近的比例、`CompassMoveOk=True`、`TargetMoveOk=True`、`CompassWidthOk=True`、`TargetLeftOk=True`、`SeamOk=True`、`OverlapWithinTolerance=True`，并打印两个窗口的 `*WindowRect` 与 `*VisualRect`。脚本会用 DWM 可见边界补偿 Windows frameless resize 边界，让 Compass 肉眼可见左边界贴到工作区左侧，并让 Target 对 seam 做很小的受控覆盖；随后短暂提升两个窗口到前台层级后恢复普通窗口，不会保留置顶。

## 快速语言切换

当用户要求“切换成中文”“软件语言改中文”“验配软件语言改中文”这类明确语言切换任务时，优先走快路径，不要先扫目录、不要读取完整脚本、不要额外抓 UI 树：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-fitting-software-language.ps1" -LanguageCode "zh-CN" -TimeoutSeconds 30
```

成功条件：

- `Status` 为 `Changed` 或 `AlreadySet`。
- `CurrentLanguage` 等于请求的语言码。

满足以上条件后立即向用户报告完成。只有在脚本返回 `NotVerified`、脚本报错、用户明确要求肉眼/UI 文本确认，或界面表现和脚本输出冲突时，才继续做 UI Automation 文本检查。

## 快速新建顾客

新建顾客优先使用脚本；只有显式传入 `-Save` 才会保存并创建顾客：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\create-target-client.ps1" -LastName "<姓>" -FirstName "<名>" -Gender <Female|Male|Other> -BirthDate "<yyyy/MM/dd>" -Save
```

安全验证时使用 `-CancelAfterFill`，脚本会填表后取消，不创建顾客：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\create-target-client.ps1" -LastName "<姓>" -FirstName "<名>" -Gender <Female|Male|Other> -BirthDate "<yyyy/MM/dd>" -CancelAfterFill
```

成功条件：

- `Status=Created` 表示已保存并创建顾客。
- `Status=FilledCancelled` 表示填表验证完成并取消，未创建顾客。
- `Status=FilledNotSaved` 表示已经填表但未保存，适合等待人工确认。
- `SaveButtonEnabled=True` 表示必填字段已满足保存条件。

## 快速打开 Palio Studio

优先使用脚本直接启动 Palio Studio，不要优先依赖 Target 顶部 Developer 菜单：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-palio-studio.ps1"
```

成功条件：

- `Status=Opened` 或 `Status=AlreadyOpen`。
- 出现 `WindowTitle=Palio Studio`。
- 不要用 `ProcessName=PalioStudio` 作为成功条件；实际窗口进程名可能仍是 `Target`。

## 快速打开顾客或会话

优先使用脚本按客户信息定位：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-target-client-session.ps1" -LastName "<姓>" -FirstName "<名>"
```

成功条件：

- `Status=OpenInvoked` 表示已执行打开动作。
- `Method=OpenSessionButton` 表示找到既有会话，已通过 `打开界面` 打开。
- `Method=DoubleClickPatientRow` 表示该客户没有可打开的既有会话，已双击客户行进入。
- `Status=AlreadyInSession` 表示目标客户当前已经处于打开状态。

## 快速截取 Target 验配界面

只截取 `Phonak Target 12.0` 当前客户区，不截整个桌面：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\capture-target-fitting-view.ps1"
```

成功条件：

- `Status=Captured`。
- `DetectedFittingPage=True`。
- `OutputPath` 指向生成的 PNG。
- 默认启用 DPI awareness，避免 Windows 缩放导致截入 Compass 或其他窗口边缘。

## 快速输入听力图

当前已经处于验配会话的 `听力图` 页面时，用脚本写入患者左耳/右耳 AC/BC/UCL 听力图点：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-audiogram.ps1" -LeftAc "<频率=dB,...>" -RightAc "<频率=dB,...>" -LeftBc "<频率=dB,...>" -RightBc "<频率=dB,...>" -LeftUcl "<频率=dB,...>" -RightUcl "<频率=dB,...>"
```

成功条件：

- `Status=Set`。
- `Verify=Left AC` / `Verify=Right AC` / `Verify=Left BC` / `Verify=Right BC` / `Verify=Left UCL` / `Verify=Right UCL` 中请求点数与 XML 读回点匹配。
- `LeftGraphXml` / `RightGraphXml` 包含请求的 `<Point><X>频率</X><Y>dB</Y></Point>`。
- 未传入的旧频率点不会被删除；脚本会用 `UnspecifiedExisting` 报告它们。
- 创建感音神经性听损数据时，让 BC 接近 AC 且无明显气骨导差，通常允许小差异；不要机械地把 BC 写成与 AC 完全相同。

## 快速选择听力图测量条件

当前已经处于验配会话的 `听力图` 页面时，用脚本设置患者左耳/右耳图下方的测量条件下拉框：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-audiogram-condition.ps1" -LeftCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>" -RightCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>"
```

成功条件：

- `Status=Set`。
- `Verify=Left Condition=<目标值>` 和/或 `Verify=Right Condition=<目标值>`。
- 只需要设置双耳相同条件时使用 `-BothCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>"`。

## 快速切换验配会话 Tab

当前已经处于顾客验配会话时，用脚本切换主 Tab 与子 Tab：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\switch-target-fitting-tab.ps1" -MainTab "<Client|Instruments|Fitting|顾客|设备|验配>" -SubTab "<子Tab名称>"
```

成功条件：

- `Status=Set`。
- `Verify=MainTab Selected`。
- 传入 `-SubTab` 时，还要出现 `Verify=SubTab Selected`。
- 可用 `-ListAvailable` 查看当前脚本固化的主 Tab 与子 Tab 名称；可用 `-DryRun` 只验证参数和目标窗口，不切换界面。

## 快速设置用户同意

当前已经处于顾客验配会话时，用脚本设置顾客详情页的用户同意/数据储存同意：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-client-consent.ps1" -Consent <Yes|No>
```

成功条件：

- `Status=Set`。
- `Verify=Consent Yes` 或 `Verify=Consent No`。
- `Verify=YesSelected` 与 `Verify=NoSelected` 和目标状态一致。
- 可用 `-GetOnly` 只读取当前状态；可用 `-DryRun` 只验证参数和目标控件，不切换同意状态。

## 操作 1：打开 Target

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-target.ps1"
```

默认可执行文件路径：

```text
C:\Program Files (x86)\Phonak\Phonak Target [Internal] 12.0.0.3627 (Alpha 0) master (2)\Target.exe
```

执行要求：

- 除非用户明确提供其他路径，否则使用上面的精确路径。
- 不使用开始菜单，也不使用 Windows Run 对话框。
- 仅在当前没有可用的 `Phonak Target 12.0` 主窗口时，才用 `Start-Process` 启动 Target。
- 启动后轮询等待可见的 Target 主窗口出现。
- 以窗口标题 `Phonak Target 12.0` 作为成功条件。

给其他 Agent 的极简提示：

```text
用 PowerShell 启动 "C:\Program Files (x86)\Phonak\Phonak Target [Internal] 12.0.0.3627 (Alpha 0) master (2)\Target.exe"，然后等待主窗口标题 "Phonak Target 12.0" 出现。
```

## 操作 2：按当前验证比例排列 Compass 和 Target

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\arrange-compass-target.ps1"
```

执行要求：

- 移动前先恢复 Compass 和 Target 窗口，避免窗口处于最小化状态。
- 使用 Compass 窗口所在屏幕的工作区。
- 将 Compass 移动到工作区左侧较小区域，宽度约为总工作区宽度的 `25.4%`。
- 将 Target 移动到工作区右侧较大区域，宽度约为总工作区宽度的 `74.6%`。
- 用 DWM 可见边界验证两个窗口最终坐标、Compass 实际可见宽度、Target 实际可见左边界和 seam 贴合状态；不能只依据 `SetWindowPos=True` 或 `GetWindowRect` 判定成功。Target 会向左做很小的受控覆盖，抵消 Windows 透明 resize 边界造成的肉眼缝隙。布局后短暂提升 Compass/Target 到前台层级，再恢复为非置顶窗口。

给其他 Agent 的极简提示：

```text
运行 PowerShell Win32 ShowWindow + SetWindowPos 布局步骤：恢复 Compass 和标题为 "Phonak Target 12.0" 的 Target 窗口，把 Compass 的 DWM 可见边界放到当前工作区左侧较窄区域约 25.4%，把 Target 的可见边界放到右侧较宽区域约 74.6%，并让 Target 对 seam 做小幅受控覆盖以消除透明边界缝隙，然后打印两个窗口的 WindowRect 和 VisualRect 坐标；只有 CompassWidthOk、TargetLeftOk、SeamOk、OverlapWithinTolerance 都为 True 才算成功。
```

## 操作 3：切换验配软件语言

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-fitting-software-language.ps1" -LanguageCode "zh-CN" -TimeoutSeconds 30
```

执行要求：

- 如果用户只要求切换语言，直接运行这个脚本；不要先运行 `rg --files`、不要读取 `target-bottom-tabs` 摘要、不要重新读取完整脚本。
- 如果 Target 没有运行，先执行 `open-target.ps1`，再执行语言脚本。除非后续需要坐标自动化，否则不需要执行 `arrange-compass-target.ps1`。
- 以脚本输出的 `CurrentLanguage` 作为主要验证来源。
- 当 `Status=Changed` 且 `CurrentLanguage=zh-CN` 时，报告“已从 PreviousLanguage 切到 zh-CN”即可结束。
- 当 `Status=AlreadySet` 且 `CurrentLanguage=zh-CN` 时，报告“已经是中文”即可结束。
- 只有用户要求列出语言、脚本提示语言不存在，或需要诊断下拉框内容时，才使用 `-ListAvailable`。

常用语言码：

- 简体中文：`zh-CN`
- 英文：`en-US`

给其他 Agent 的极简提示：

```text
用户要求 Target 软件语言切中文时，直接运行 set-fitting-software-language.ps1 -LanguageCode zh-CN -TimeoutSeconds 30；若 CurrentLanguage 是 zh-CN 且 Status 是 Changed/AlreadySet，就停止，不要额外扫目录或抓 UI 树。
```

## 操作 4：新建顾客

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\create-target-client.ps1" -LastName "<姓>" -FirstName "<名>" -Gender <Female|Male|Other> -BirthDate "<yyyy/MM/dd>" -Save
```

执行要求：

- 如果 Target 没有运行，先执行 `open-target.ps1`。
- `LastName` 与 `FirstName` 是必填参数。
- `Gender` 只接受 `Female`、`Male`、`Other`，脚本会按新顾客对话框中三个性别单选按钮的横向顺序选择。
- 可选参数包括 `Address1`、`Address2`、`PostalCode`、`City`、`Email`、`PhoneHome`、`PhoneBusiness`。
- 不带 `-Save` 时不会保存；带 `-CancelAfterFill` 时填表后取消；带 `-Save` 时才调用保存按钮。
- 脚本使用 `Home.PatientManagement.NewPatientButton` 打开新顾客对话框，并用 `Home.PatientManagement.PersonalDetails.*` 字段写入表单。

给其他 Agent 的极简提示：

```text
新建 Target 顾客时运行 create-target-client.ps1，传 LastName/FirstName 和可选字段；只有用户明确要保存时才加 -Save，否则用 -CancelAfterFill 做验证。
```

## 操作 5：打开 Palio Studio

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-palio-studio.ps1"
```

默认 Palio Studio 路径：

```text
C:\Program Files (x86)\Phonak\Phonak Target [Internal] 12.0.0.3627 (Alpha 0) master (2)\PalioStudio.exe
```

执行要求：

- 不要优先从 Target 的 `Developer > Launch PalioStudio...` 菜单启动；Target 的 UIA 子树可能临时返回 0 个节点，导致菜单项不可发现。
- 使用 `.NET ProcessStartInfo` 启动 `PalioStudio.exe`，不要直接依赖 `Start-Process -FilePath`；默认路径包含 `[Internal]`，PowerShell 可能把方括号当通配符处理。
- 成功判据是检测到窗口标题 `Palio Studio`，不是检测到 `PalioStudio` 进程名。
- 如果脚本输出 `Status=AlreadyOpen`，表示已有 Palio Studio 窗口，脚本已尝试置前。
- 如果脚本输出 `Status=StartedNoWindowDetected`，报告启动进程 ID 和路径，再检查是否有窗口标题为 `Palio Studio` 的 `Target` 进程。

给其他 Agent 的极简提示：

```text
打开 Palio Studio 时直接运行 open-palio-studio.ps1；成功看 WindowTitle=Palio Studio，进程名可能是 Target，不要用 PalioStudio 进程名判断。
```

## 操作 6：打开指定顾客或会话

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-target-client-session.ps1" -LastName "<姓>" -FirstName "<名>"
```

执行要求：

- 至少提供 `ClientNumber`、`LastName`、`FirstName` 中的一个；更推荐同时提供姓和名。
- 如果指定会话，可追加 `-SessionText "<会话行可见文本>"`。
- 先进入 `Clients & sessions` 并确保执行 `Show all`，再在 `Home.PatientManagement.PatientListView` 中匹配客户行。
- 如果客户下面存在会话行，选择目标会话行并调用 `Home.PatientManagement.OpenSessionButton`。
- 如果客户下面没有会话行，或 `OpenSessionButton` 对该客户禁用，双击客户行；这是 Target 对无会话客户进入流程的实际入口。
- 如果当前已经在目标客户的会话内，脚本返回 `Status=AlreadyInSession`，不要重复打开。

给其他 Agent 的极简提示：

```text
打开 Target 顾客时运行 open-target-client-session.ps1；有会话选会话行后点 OpenSessionButton，无会话则双击客户行。
```

## 操作 7：截取 Target 验配界面

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\capture-target-fitting-view.ps1"
```

执行要求：

- 脚本查找窗口标题精确等于 `Phonak Target 12.0` 的顶层窗口。
- 默认截取 Target 客户区 `ClientArea`，不截 Compass、桌面或其他应用；需要包含 Windows 外框时才加 `-IncludeWindowFrame`。
- 脚本会先置前 Target 窗口，再使用 Win32 坐标和 `System.Drawing.CopyFromScreen` 保存 PNG。
- 脚本启用 `SetProcessDPIAware()`；不要删除这一步，否则在 Windows 缩放下可能把左侧 Compass 边缘截入图像。
- `DetectedFittingPage=True` 通过 UIA 中 `AutomationId` 或 `ClassName` 是否包含 `Fitting` 判断，不依赖中文可见文本。
- 默认输出到桌面 `FAI` 目录，文件名形如 `target-fitting-view-yyyyMMdd-HHmmss.png`；可用 `-OutputPath` 指定路径。

给其他 Agent 的极简提示：

```text
只截 Target 验配界面时运行 capture-target-fitting-view.ps1；成功看 Status=Captured、DetectedFittingPage=True，并返回 OutputPath。
```

## 操作 8：快速输入左右耳 AC/BC/UCL 听力图

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-audiogram.ps1" -LeftAc "<频率=dB,...>" -RightAc "<频率=dB,...>" -LeftBc "<频率=dB,...>" -RightBc "<频率=dB,...>" -LeftUcl "<频率=dB,...>" -RightUcl "<频率=dB,...>"
```

执行要求：

- 先确保 Target 已打开指定顾客会话，并且当前页面是验配区的 `听力图` 页；脚本要求能找到两个 `ClassName=AudiogramControl`。
- 参数按患者耳侧和曲线类型命名：`LeftAc`/`RightAc` 写气导，`LeftBc`/`RightBc` 写骨导，`LeftUcl`/`RightUcl` 写不舒适阈。不要按屏幕左右理解；当前 Target 中患者右耳图在屏幕左侧，患者左耳图在屏幕右侧。
- 支持频率：`125`, `250`, `500`, `750`, `1000`/`1k`, `1500`/`1.5k`, `2000`/`2k`, `3000`/`3k`, `4000`/`4k`, `6000`/`6k`, `8000`/`8k`。
- 支持 dB：`0` 到 `120`，以 `5` dB 为步进。
- 脚本按传入参数先后选择 `Fitting.PatientArea.Audiogram.AcRadioButton`、`Fitting.PatientArea.Audiogram.BcRadioButton` 或 `Fitting.PatientArea.Audiogram.UclRadioButton`，再按已验证的听力图相对坐标点击点位。
- `AudiogramControl` 虽暴露 `ValuePattern`，但经验证 `SetValue()` 不会实际覆盖曲线；有效写入方式是图表点击。同一频率再次点击可更新该频率的 dB。
- 创建感音神经性聋案例时，让 BC 与 AC 形态相近、差值保持在临床可接受的小范围内；完全重合过于机械，除非用户明确要求。
- 不要承诺清空旧点；空 XML 对当前控件不清空曲线。未传入的旧频率会保留，并在脚本输出中显示为 `UnspecifiedExisting`。
- 可先加 `-DryRun` 查看计划点击坐标，不写入；`-Precheck` 只作为坐标调试提示，已有点位可能让悬停文本出现旧读数，最终仍以 XML 读回验证为准。
- 写入后以 `AudiogramControl` 的 XML 读回值为主要验证来源。

给其他 Agent 的极简提示：

```text
在 Target 验配听力图页输入听力图时运行 set-target-audiogram.ps1，传 -LeftAc/-RightAc、-LeftBc/-RightBc 和 -LeftUcl/-RightUcl 的 频率=dB 列表；成功看 Status=Set 和各耳 AC/BC/UCL Verify，未指定旧点不会被删除。
```

## 操作 9：快速选择左右耳听力图测量条件

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-audiogram-condition.ps1" -LeftCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>" -RightCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>"
```

执行要求：

- 先确保 Target 已打开指定顾客会话，并且当前页面是验配区的 `听力图` 页；脚本要求能找到两个 `ClassName=AudiogramControl` 和图下方两个无 `AutomationId` 的 `ComboBox`。
- 参数按患者耳侧命名。不要按屏幕左右理解；当前 Target 中患者右耳图在屏幕左侧，患者左耳图在屏幕右侧。
- 可用值为 `Tdh`、`ER3`、`ER3Custom`、`LS0`、`LS45`、`LS90`。脚本也接受常见中英文别名并规范化为这些 UIA 选项名。
- 只需要设置双耳相同条件时使用 `-BothCondition`。
- 可用 `-ListAvailable` 输出可用条件；可用 `-DryRun` 查看计划操作，不写入。
- 写入后以 `SelectionPattern` 读回选中项作为验证来源。

给其他 Agent 的极简提示：

```text
在 Target 验配听力图页选择测量条件时运行 set-target-audiogram-condition.ps1，传 -LeftCondition/-RightCondition 或 -BothCondition；成功看 Status=Set 和 Verify=Left/Right Condition。
```

## 操作 10：快速切换验配会话 Tab

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\switch-target-fitting-tab.ps1" -MainTab "<Client|Instruments|Fitting|顾客|设备|验配>" -SubTab "<子Tab名称>"
```

执行要求：

- 先确保 Target 已打开顾客验配会话；脚本要求能找到 `Fitting.ClientTabItem`、`Fitting.InstrumentsTabItem` 或 `Fitting.FittingTabItem`。
- 主 Tab 使用稳定 `AutomationId` 定位：`Client/顾客` 对应 `Fitting.ClientTabItem`，`Instruments/设备` 对应 `Fitting.InstrumentsTabItem`，`Fitting/验配` 对应 `Fitting.FittingTabItem`。
- 子 Tab 没有稳定 `AutomationId`，按当前主 Tab 下可见 `ControlType.TabItem` 的精确 `Name` 定位。
- 可用主 Tab 与子 Tab：`Client/顾客` 下含 `详情`、`听力图`、`RECD`、`REUG`；`Instruments/设备` 下含 `助听器`、`声学参数`、`详情`、`辅件`；`Fitting/验配` 下含 `反馈和真耳测试`、`声耦合测量`、`内置测听`、`基本调节`、`精细调节`、`数据储存`、`设备选项`。
- 可用 `-ListAvailable` 输出脚本固化的 Tab 名称；可用 `-DryRun` 验证目标窗口与参数，不切换界面。
- 切换后以 `SelectionItemPattern.Current.IsSelected` 读回主 Tab 和子 Tab 的选中状态作为验证来源。

给其他 Agent 的极简提示：

```text
在 Target 顾客验配会话内切换页面时运行 switch-target-fitting-tab.ps1，传 -MainTab 和 -SubTab；主 Tab 用 Fitting.*TabItem AutomationId，子 Tab 用可见 TabItem Name，成功看 Status=Set、Verify=MainTab Selected 和 Verify=SubTab Selected。
```

## 操作 11：设置顾客详情页用户同意

优先运行内置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-client-consent.ps1" -Consent <Yes|No>
```

执行要求：

- 先确保 Target 已打开顾客验配会话；脚本默认会切到 `顾客 / 详情`。
- 选项用稳定 `AutomationId` 定位：`YesRadioButton` 表示用户同意开启数据储存，`NoRadioButton` 表示不同意。
- 两个单选按钮都支持 `SelectionItemPattern`；写入后用 `SelectionItemPattern.Current.IsSelected` 读回验证。
- 可用 `-GetOnly` 读取当前同意状态，不修改界面。
- 可用 `-DryRun` 查看计划操作，不修改界面。
- 如果调用方已经手动确保处于详情页，可加 `-NoEnsureDetailsTab` 跳过自动切页。

给其他 Agent 的极简提示：

```text
设置 Target 顾客详情页用户同意时运行 set-target-client-consent.ps1 -Consent Yes/No；脚本用 YesRadioButton/NoRadioButton，成功看 Status=Set 和 Verify=Consent。
```

## 控件作用参考

需要理解 Target Home 页控件含义、AutomationId、可点击状态或推荐操作方式时，读取 `references/target-home-controls.md`。

这份参考只面向 Microsoft UI Automation，用于确认 `ControlType`、`AutomationId`、`ClassName`、启用状态和边界矩形。

## 验证

在开始更深入的 UI Automation 操作前，确认以下条件：

- `Target.exe` 正在运行。
- 存在一个可见顶层窗口，标题为 `Phonak Target 12.0`。
- `Compass` 和 `Target` 的可见窗口矩形位于同一个工作区内，`CompassWidthOk=True`、`TargetLeftOk=True`、`SeamOk=True`、`OverlapWithinTolerance=True`，且宽度比例接近 `25.4% : 74.6%`。
- 两个窗口都没有最小化。

如果验证失败，报告具体缺失条件并停止。不要继续对过期、隐藏或最小化窗口执行基于坐标的 UI 自动化。

语言切换任务的验证更轻量：`set-fitting-software-language.ps1` 返回 `Status=Changed` 或 `Status=AlreadySet`，并且 `CurrentLanguage` 等于请求语言码时，即视为完成。不要默认追加 UI 树抓取、截图或可见文本扫描。

## 失败处理

- 如果 Target 可执行文件路径不存在，向用户询问当前安装的 `Target.exe` 路径。
- 如果 Target 已启动但超时前没有出现 `Phonak Target 12.0` 标题，列出正在运行的 `Target` 进程及其窗口标题。
- 如果 Compass 没有主窗口句柄，要求用户先让 Compass 桌面应用保持可见。
- 如果窗口移动返回 `False`，报告 `GetLastWin32Error` 返回的 Win32 错误码。
- 如果窗口移动返回 `True` 但 `CompassWidthOk`、`TargetLeftOk`、`SeamOk` 或 `OverlapWithinTolerance` 为 `False`，报告最终 `WindowRect` 和 `VisualRect`，不要继续坐标自动化。
- 如果语言脚本找不到请求语言码，使用 `-ListAvailable` 列出可用语言，并把可用语言码反馈给用户。
- 如果新建顾客脚本返回保存按钮禁用，检查 `LastName`、`FirstName`、`BirthDate` 和 `Gender` 参数是否符合当前表单要求。
- 如果 Palio Studio 打开失败，先确认 `PalioStudio.exe` 路径存在；路径存在但启动失败时，不要回退到 `Start-Process` 通配符路径，继续使用 `.NET ProcessStartInfo` 或报告原始异常。
- 如果打开顾客/会话脚本提示当前已在其他会话内，先让用户确认是否保存并关闭当前会话；不要自动点击 `保存并关闭`。
- 如果截取脚本输出 `DetectedFittingPage=False`，说明当前 Target 可能不在验配页，或 UIA 子树未暴露 `Fitting.*` 标识；报告 PNG 路径并说明检测结果，不要谎称已捕获验配页。
