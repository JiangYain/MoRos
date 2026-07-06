# Target Home 页控件作用参考

## 使用前提

本参考只面向 Microsoft UI Automation。后续 Agent 应通过 PowerShell/.NET 的 `System.Windows.Automation` 抓取、定位和操作 Target 控件。

本参考基于 Target 主窗口的 UIA `ControlView` 树整理：

- 根窗口：`Window Name="Phonak Target 12.0"`
- 根 `AutomationId`：`CocoonInternalMainWindow`
- 主容器：`Foundation.MainShell`
- 当前页：`HomeView`
- UIA 原始树文件：`C:\Users\chord\Desktop\FAI\target-ui-tree-20260618-120047.txt`

## UIA 定位原则

优先级：

1. 用窗口标题 `Phonak Target 12.0` 找到 Target 主窗口。
2. 用根 `AutomationId=CocoonInternalMainWindow` 验证主窗口身份。
3. 对常规控件优先用 `AutomationId` 定位。
4. 没有 `AutomationId` 时，用 `ControlType + Name + Enabled` 组合定位。
5. 底部 Home 功能入口的 `Name` 不完整，优先用其子元素类名或相对位置推断，点击后必须重新抓 UIA 树验证页面是否切换。

PowerShell/UIA 定位示例：

```powershell
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$target = Get-Process -Name Target |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq "Phonak Target 12.0" } |
  Select-Object -First 1

$root = [System.Windows.Automation.AutomationElement]::FromHandle($target.MainWindowHandle)
$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
  "Home.PatientManagement.NewPatientButton"
)
$button = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
```

## 顶部标题区

| 控件 | Microsoft UIA 定位信息 | 状态 | 作用 |
|---|---|---:|---|
| 主窗口 | `ControlType.Window`, `Name=Phonak Target 12.0`, `AutomationId=CocoonInternalMainWindow` | 可见 | Target 主窗口。所有 Target UI 自动化都应先定位这个窗口。 |
| 主框架 | `ControlType.Custom`, `AutomationId=Foundation.MainShell`, `ClassName=MainShellView` | 可见 | Target 的 WPF 主 Shell。通常不直接操作。 |
| 标题文本 | `ControlType.Text`, `Name=Phonak Target 12.0` | 可见 | 版本标题，用于确认应用已进入主界面。 |
| 测试/内部标记 | `ControlType.Text`, `Name=Test/Internal/(Alpha 0)` | 可见 | 构建类型和内部版本提示，只读信息。 |

## 顶部菜单与窗口按钮

| 控件 | Microsoft UIA 定位信息 | 状态 | 作用 |
|---|---|---:|---|
| File | `ControlType.MenuItem`, `Name=File` | 可见 | 文件相关菜单入口。子菜单需要单独用 UIA Expand/Invoke 或键盘路径验证。 |
| eService | `ControlType.MenuItem`, `Name=eService` | 可见 | eService 相关菜单入口。可能与在线服务/账号能力有关，具体子项需单独展开验证。 |
| Help | `ControlType.MenuItem`, `Name=Help` | 可见 | 帮助菜单入口。 |
| Developer | `ControlType.MenuItem`, `Name=Developer` | 可见 | 开发者菜单入口。内部版 Target 可见，可能包含调试/内部工具。 |
| 登录按钮 | `ControlType.Button` under `ControlPlaceholder<SignInView>` | 可见 | 登录 Phonak/Sonova 账号入口。不要自动提交账号或凭据。 |
| 最小化 | `ControlType.Button`, `AutomationId=Minimize` | 可见 | 最小化 Target 窗口。自动化流程中通常不要使用。 |
| 最大化/还原 | `ControlType.Button`, `AutomationId=MaximizeOrRestore` | 可见 | 最大化或还原 Target 窗口。布局脚本已用 Win32 控制窗口尺寸，通常不要点此按钮。 |
| 关闭 | `ControlType.Button`, `AutomationId=Close` | 可见 | 关闭 Target。除非用户明确要求，不要自动点击。 |

## Developer 菜单展开项

先定位并展开顶层菜单项 `ControlType.MenuItem`, `Name=Developer`，再在弹出的菜单树中按 `ControlType.MenuItem + Name` 定位以下条目。

这些条目属于内部版 Target 的开发、调试、仿真或数据生成入口。除非用户明确指定目标动作，不要自动执行会启动外部工具、生成数据、加载测试或改变运行环境的菜单项。

| 菜单项 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Launch HI Observer... | `ControlType.MenuItem`, `Name=Launch HI Observer...` | 启动 HI Observer 内部观察/诊断工具。 | 可能打开外部工具或诊断窗口；执行后需验证新窗口。 |
| Emulations | `ControlType.MenuItem`, `Name=Emulations` | 仿真相关子菜单入口。 | 有子菜单，展开后继续按子项 `Name` 定位。 |
| Debugging | `ControlType.MenuItem`, `Name=Debugging` | 调试相关子菜单入口。 | 有子菜单；可能改变调试状态，执行前确认目标。 |
| Services overviews | `ControlType.MenuItem`, `Name=Services overviews` | 服务概览相关子菜单入口。 | 有子菜单；通常用于查看内部服务状态。 |
| Connected devices | `ControlType.MenuItem`, `Name=Connected devices` | 已连接设备相关子菜单入口。 | 有子菜单；可能影响或查看设备连接状态。 |
| Global tuning | `ControlType.MenuItem`, `Name=Global tuning` | 全局调试/调音相关子菜单入口。 | 有子菜单；可能影响验配参数或调试视图。 |
| EXAM | `ControlType.MenuItem`, `Name=EXAM` | EXAM 相关内部功能入口。 | 有子菜单；具体作用需展开后验证。 |
| Lyric ALPS | `ControlType.MenuItem`, `Name=Lyric ALPS` | Lyric ALPS 相关内部功能入口。 | 有子菜单；具体作用需展开后验证。 |
| REMiFit | `ControlType.MenuItem`, `Name=REMiFit` | REMiFit 相关内部功能入口。 | 有子菜单；具体作用需展开后验证。 |
| TargetMatchExt | `ControlType.MenuItem`, `Name=TargetMatchExt` | TargetMatch 扩展相关入口。 | 有子菜单；可能涉及外部测量/匹配流程。 |
| Curves | `ControlType.MenuItem`, `Name=Curves` | 曲线相关内部功能入口。 | 有子菜单；可能打开调试曲线视图。 |
| Load 'Phoneme Perception Tests'... | `ControlType.MenuItem`, `Name=Load 'Phoneme Perception Tests'...` | 加载音素感知测试数据或模块。 | 可能改变当前测试/数据状态；执行前确认。 |
| Generate patient database... | `ControlType.MenuItem`, `Name=Generate patient database...` | 生成患者数据库。 | 会生成或修改数据，必须先获得用户明确确认。 |
| Create CUPeR 2 Sender ID... | `ControlType.MenuItem`, `Name=Create CUPeR 2 Sender ID...` | 创建 CUPeR 2 Sender ID。 | 可能生成标识符或配置项，执行前确认用途。 |
| Launch PalioStudio... | `ControlType.MenuItem`, `Name=Launch PalioStudio...` | 启动 PalioStudio。 | 可能打开外部工具；执行后需验证新窗口。 |

## Developer 二级菜单明细

先展开 `Developer`，再展开下表中的父菜单项。二级项均按 `ControlType.MenuItem` + 精确 `Name` 定位。

| 父菜单项 | 二级菜单项 `Name` | 自动化注意事项 |
|---|---|---|
| Emulations | `Auto HI emulation`; `HI emulation...`; `Acc emulation...`; `Data logging`; `Battery state` | 仿真和数据记录相关功能，可能改变当前运行环境。 |
| Debugging | `Memory Monitor`; `Amplifon1P session dump`; `Web updates`; `Deep links`; `Exceptions`; `Fitting side`; `Rollback and disconnect`; `Workflows`; `User program management`; `Authentication`; `Remote support`; `Real ear measurements`; `Synchronize inconsistent fittings`; `Force garbage collection`; `Clear WPF control caches`; `Connection states...`; `Threads simulation...`; `Report...`; `Background tasks`; `Save JuniorMode preferences`; `Count children...`; `Launch Target Service Tool...`; `Flush transaction log`; `Firmware Update GDF check`; `Enable fitting authentication`; `Use highest security levels without authorization` | 调试功能集合。涉及连接、认证、安全级别、事务日志或后台任务的项不要自动执行。 |
| Services overviews | `General services...`; `Programs selection services...`; `Basic fitting services...`; `Fitting input services...`; `Patient management services...`; `Product catalog services...`; `Data logging services...`; `Media services...`; `UndoRedo snapshots services...`; `Hearing instruments infos services...` | 多数是服务状态/服务概览窗口，执行后验证新窗口标题。 |
| Connected devices | `Set consent statement key` | 设备连接/授权相关，执行前确认用途。 |
| Global tuning | `Debug trace dump controller`; `Dump workflow curves`; `Dump features`; `Dump BigData`; `Dump SmartMan related features and curves`; `Recalc selected program from scratch (keep fine tuning)`; `Recalc selected program from scratch (drop fine tuning)`; `Dump Curve Display`; `Tuningdata viewer` | 调音和转储相关。`Recalc...` 会重新计算程序，必须明确确认。 |
| EXAM | `Dump audiological model`; `Dump MFT`; `Apply EXAM Gain and Features`; `Force Feedback Test V1` | EXAM 相关调试/应用动作，可能改变当前验配状态。 |
| Lyric ALPS | `Login`; `Connect`; `Disconnect`; `Read client`; `Select left device`; `Select right device`; `Remove left device`; `Remove right device`; `Renew left subscription`; `Renew right subscription`; `Cancel left subscription`; `Cancel right subscription`; `Show offline modififications`; `SetOfflineModeAction` | 涉及登录、连接、客户读取、设备选择和订阅变更。不要自动执行账号、设备或订阅相关动作。 |
| REMiFit | `Emulation`; `Workflows`; `HI communication` | REMiFit 仿真、工作流和助听器通信相关入口。 |
| TargetMatchExt | `Sonova.Kona.Modularity.MenuProvider.UserInterface.MenuEntryModel`; `EnableImc2Logging`; `EnableFeatureDumping` | TargetMatch 扩展内部项；日志和特征转储会改变诊断输出。 |
| Curves | `Realtime curves`; `Response curve calculation`; `Show predefined 2cc curves...`; `Enable AudiogramDirect dumping` | 曲线查看、计算和转储相关。 |

## Help 菜单展开项

先定位并展开顶层菜单项 `ControlType.MenuItem`, `Name=Help`，再在弹出的菜单树中按 `ControlType.MenuItem + Name` 定位以下条目。

| 菜单项 | Microsoft UIA 定位信息 | 快捷键 | 作用 | 自动化注意事项 |
|---|---|---|---|---|
| Web help | `ControlType.MenuItem`, `Name=Web help` | `F1` | 打开 Web 帮助。 | 可能打开浏览器或外部页面；除非用户明确要求，不要自动执行。 |
| PhonakPro | `ControlType.MenuItem`, `Name=PhonakPro` | 无 | 打开 PhonakPro 相关资源。 | 可能打开浏览器或外部页面；除非用户明确要求，不要自动执行。 |
| Pediatric tools | `ControlType.MenuItem`, `Name=Pediatric tools` | 无 | 打开儿童验配相关工具或资源。 | 可能进入独立工具或外部资源，执行前先确认目标。 |
| Desktop sharing | `ControlType.MenuItem`, `Name=Desktop sharing` | 无 | 桌面共享入口。 | 可能触发共享/远程支持流程，不要自动执行。 |
| Show general hints | `ControlType.MenuItem`, `Name=Show general hints` | `F2` | 显示通用提示。 | 可用于查看内置提示；执行后需重新抓 UIA 树确认弹窗或提示状态。 |
| User guides | `ControlType.MenuItem`, `Name=User guides` | 无 | 用户指南子菜单入口。 | 有子菜单，展开后继续按子项 `Name` 定位。 |
| Cleaning & disinfection guide | `ControlType.MenuItem`, `Name=Cleaning & disinfection guide` | 无 | 打开清洁与消毒指南。 | 可能打开文档或外部资源。 |
| Cable overview | `ControlType.MenuItem`, `Name=Cable overview` | 无 | 打开线缆概览。 | 可能打开说明页面或文档。 |
| Delete all updates... | `ControlType.MenuItem`, `Name=Delete all updates...` | 无 | 删除已下载或缓存的更新。 | 具有删除性质，必须先获得用户明确确认。 |
| Log files | `ControlType.MenuItem`, `Name=Log files` | 无 | 日志文件子菜单入口。 | 有子菜单，展开后继续按子项 `Name` 定位；不要自动上传或发送日志。 |
| Privacy notice form | `ControlType.MenuItem`, `Name=Privacy notice form` | 无 | 打开隐私声明表单。 | 可能打开文档或表单。 |
| FDA regulation form | `ControlType.MenuItem`, `Name=FDA regulation form` | 无 | 打开 FDA 法规表单。 | 可能打开文档或表单。 |
| About DSL v5a | `ControlType.MenuItem`, `Name=About DSL v5a` | 无 | 打开 DSL v5a 信息窗口。 | 通常是只读关于信息，执行后验证弹窗标题。 |
| About Phonak Target | `ControlType.MenuItem`, `Name=About Phonak Target` | 无 | 打开 Phonak Target 关于窗口。 | 通常是只读关于信息，执行后验证弹窗标题。 |

## Help 二级菜单明细

先展开 `Help`，再展开下表中的父菜单项。二级项均按 `ControlType.MenuItem` + 精确 `Name` 定位。

| 父菜单项 | 二级菜单项 `Name` | 自动化注意事项 |
|---|---|---|
| User guides | `Standard`; `Lyric ALPS` | 可能打开用户指南文档或外部阅读器。 |
| Log files | `Send by email`; `Save to desktop`; `Save to...` | `Send by email` 可能外发日志；`Save...` 会写入文件，执行前确认目标位置。 |

## Home 内容区

| 控件 | Microsoft UIA 定位信息 | 状态 | 作用 |
|---|---|---:|---|
| 内容宿主 | `ControlType.Pane`, `AutomationId=PART_Content`, `ClassName=ScrollViewer` | 可见 | 主内容区域宿主。 |
| Home 页 | `ControlType.Custom`, `ClassName=HomeView` | 可见 | 当前 Home 页面。 |
| Home Tab 控件 | `ControlType.Tab`, `AutomationId=Home.HomeTabControl`, `ClassName=TabControl` | 可见 | 底部 Home 功能入口集合。 |
| Clients & sessions | `ControlType.Text`, `AutomationId=Home.PatientManagementTextBlock`, `Name=Clients & sessions` | 可见 | 当前选中的 Home 功能区：客户与会话管理。 |
| PatientManagementView | `ControlType.Custom`, `AutomationId=View`, `ClassName=PatientManagementView` | 可见 | 客户与会话管理主视图。 |

## Clients & sessions 区域按钮

| 控件 | Microsoft UIA 首选定位 | 状态 | 作用 | 备注 |
|---|---|---:|---|---|
| New client... | `AutomationId=Home.PatientManagement.NewPatientButton`, `ControlType.Button` | 启用 | 创建新客户。通常是后续创建客户资料流程的入口。 | 可用 `InvokePattern` 触发。 |
| Open session | `AutomationId=Home.PatientManagement.OpenSessionButton`, `ControlType.Button` | 禁用 | 打开已有会话。 | 仅在选中可打开的会话行后启用；无会话客户要双击客户行进入。 |
| New session | `AutomationId=Home.PatientManagement.NewSessionButton`, `ControlType.Button` | 禁用 | 为选中客户创建新会话。 | 当前无客户选择时禁用。 |
| Reports... | `Name=Reports...`, `ControlType.Button`, `IsEnabled=False` | 禁用 | 打印或发送报告。 | 没有稳定 `AutomationId`；通常需要选中客户/会话后启用。 |
| Show all 顶部按钮 | `AutomationId=Home.PatientManagement.ShowAllButton`, `ControlType.Button` | 启用 | 显示所有客户。 | 位于搜索框右侧。 |
| Search | `AutomationId=Home.PatientManagement.SearchButton`, `ControlType.Button` | 禁用 | 按搜索框内容筛选客户。 | 当前搜索框为空时禁用；输入搜索内容后应重新抓 UIA 树确认状态。 |
| SearchBox | `AutomationId=PART_SearchBox`, `ControlType.Edit`, `ClassName=TextBox` | 启用 | 客户搜索输入框。 | 可通过 `ValuePattern` 或键盘输入设置文本；输入后 `Search` 应变为可用。 |
| 空状态提示 | `ControlType.Text`, `Name=Use search field or click "Show all"` | 只读 | 提示用户搜索或显示全部客户。 | 用于确认当前客户列表为空或尚未加载。 |
| Show all 空状态按钮 | `AutomationId=Home.PatientManagement.PatientList.ShowAllButton`, `ControlType.Button` | 启用 | 空状态区域中央的显示所有客户按钮。 | 作用与顶部 `Show all` 相同。 |
| Details 面板 | `AutomationId=Details`, `ControlType.Pane`, `ClassName=ScrollViewer` | 可见 | 客户/会话详情显示区域。 | 当前无选择时为空。 |
| 历史客户列表 | `AutomationId=Home.PatientManagement.PatientListView`, `ControlType.DataGrid`, `ClassName=ListView` | 点击 `Show all` 后可见 | 历史客户集合。 | 子项是 `ControlType.DataItem`, `ClassName=ListViewItem`；客户姓名等文本是动态数据，不写入自动化规则。 |

`Clients & sessions` 进入历史客户/会话的已验证流程：

1. 确认当前页面是客户与会话页：存在 `AutomationId=View`, `ClassName=PatientManagementView`，并存在搜索框 `AutomationId=PART_SearchBox`。
2. 如未出现 `Home.PatientManagement.PatientListView`，优先对 `Home.PatientManagement.ShowAllButton` 执行 `InvokePattern`；如果顶部按钮不可用但空状态存在，则对 `Home.PatientManagement.PatientList.ShowAllButton` 执行 `InvokePattern`。
3. 点击 `Show all` 后等待 `Home.PatientManagement.PatientListView` 出现；此时 `Show all` 通常变为禁用，列表子项为多个 `DataItem/ListViewItem`。
4. 选择目标客户行：对目标 `DataItem` 使用 `SelectionItemPattern.Select()`。只按用户给定的客户线索选择，不把客户姓名写入 Skill。
5. 如果客户下面存在会话行，选择目标会话行；此时 `Home.PatientManagement.OpenSessionButton` 应变为启用，并支持 `InvokePattern`。
6. 如果客户下面没有会话行，详情面板可能显示 `无可用界面`，且 `OpenSessionButton` 禁用；这种情况不要点 `NewSessionButton`，应双击客户行进入。
7. 打开既有会话时，先确认已选中正确客户和正确会话，再调用 `OpenSessionButton`；无会话客户则双击客户行。进入后重新抓 UIA 树确认新页面。
8. 已验证例子：`Zheng | Chord` 这类无会话客户，选中后 `OpenSessionButton=False`、`NewSessionButton=True`，双击客户行后进入会话内页面，能看到 `顾客视图`、`连接`、客户名和 `验配` 等文本。

打开顾客/会话脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\open-target-client-session.ps1" -LastName "Zheng" -FirstName "Chord"
```

`New client...` / 新顾客对话框：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 新顾客窗口 | `AutomationId=Home.PatientManagement.PersonalDetailsDialogWindow`, `ControlType.Window` | 新建/编辑个人资料对话框。 | 通过 `Home.PatientManagement.NewPatientButton` 打开。 |
| LastName / 姓 | `AutomationId=Home.PatientManagement.PersonalDetails.LastNameTextBox`, `ControlType.Edit` | 姓。 | 支持 `ValuePattern.SetValue()`；新建顾客脚本把它作为必填参数。 |
| FirstName / 名 | `AutomationId=Home.PatientManagement.PersonalDetails.FirstNameTextBox`, `ControlType.Edit` | 名。 | 支持 `ValuePattern.SetValue()`；新建顾客脚本把它作为必填参数。 |
| Address1 / Address2 | `AutomationId=Home.PatientManagement.PersonalDetails.Address1` / `Address2`, `ControlType.Edit` | 地址。 | 可选字段；未明确提供时不要覆盖。 |
| PostalCode / City | `AutomationId=Home.PatientManagement.PersonalDetails.PostalCode` / `City`, `ControlType.Edit` | 邮编和城市。 | 可选字段；未明确提供时不要覆盖。 |
| Gender | `GenderFemale` 与 `GenderMale` 以及第 3 个横向单选按钮 | 性别。 | `Other` 的 `AutomationId` 与 `GenderMale` 重复，脚本按横向顺序 `Female`, `Male`, `Other` 选择。 |
| BirthDate | `AutomationId=Home.PatientManagement.PersonalDetails.BirthDate`, `ControlType.Edit` | 生日。 | 支持 `ValuePattern.SetValue()`；脚本把可解析日期格式化为 `yyyy/MM/dd`。 |
| Age | `AutomationId=Home.PatientManagement.PersonalDetails.Age`, `ControlType.Text` | 年龄显示。 | 只读，由生日自动推导。 |
| Email | `AutomationId=Home.PatientManagement.PersonalDetails.Email`, `ControlType.Edit` | 邮箱。 | 可选字段；未明确提供时不要覆盖。 |
| PhoneHome / PhoneBusiness | `AutomationId=Home.PatientManagement.PersonalDetails.PhoneHome` / `PhoneBusiness`, `ControlType.Edit` | 家庭电话和业务电话。 | 可选字段；未明确提供时不要覆盖。 |
| Save | `AutomationId=Home.PatientManagement.PersonalDetails.SaveButton`, `ControlType.Button` | 保存并创建/更新顾客。 | 必填字段不足时禁用；只有用户明确要求保存时调用。 |
| Cancel | `AutomationId=Home.PatientManagement.PersonalDetails.CancelButton`, `ControlType.Button` | 取消对话框。 | 用于验证脚本的非提交测试。 |

新建顾客脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\create-target-client.ps1" -LastName "Testit" -FirstName "It" -Gender Male -BirthDate "1956/01/01" -Save
```

## 验配会话 > 听力图页

进入顾客会话后，验配区的听力图页不是 Home 页面。当前已验证的根部线索：

- 会话页壳：`ClassName=FittingShellView`。
- 主 Tab：`AutomationId=Fitting.MainTabControl`。
- 客户区 Tab：`AutomationId=Fitting.ClientTabItem`。
- 听力图子页：`ControlType.TabItem`, `Name=听力图`。
- 听力图视图：`ClassName=AudiogramView`，外层可能是 `ControlPlaceholder<AudiogramView>`。

## 验配会话 > Tab 结构与切换

会话页的顶部主 Tab 和第二层子 Tab 都暴露 `SelectionItemPattern`。主 Tab 有稳定 `AutomationId`；子 Tab 当前没有稳定 `AutomationId`，但可见 `Name` 稳定。

主 Tab：

| 主 Tab | Microsoft UIA 定位信息 | 子 Tab |
|---|---|---|
| 顾客 | `ControlType.TabItem`, `AutomationId=Fitting.ClientTabItem` | `详情`, `听力图`, `RECD`, `REUG` |
| 设备 | `ControlType.TabItem`, `AutomationId=Fitting.InstrumentsTabItem` | `助听器`, `声学参数`, `详情`, `辅件` |
| 验配 | `ControlType.TabItem`, `AutomationId=Fitting.FittingTabItem` | `反馈和真耳测试`, `声耦合测量`, `内置测听`, `基本调节`, `精细调节`, `数据储存`, `设备选项` |

切换策略：

1. 先用窗口标题 `Phonak Target 12.0` 找到 Target 主窗口。
2. 用 `AutomationId=Fitting.MainTabControl` 确认当前处于验配会话壳内。
3. 按目标主 Tab 的 `AutomationId` 找到 `TabItem`，执行 `SelectionItemPattern.Select()`。
4. 重新抓取 UIA 根节点，按目标子 Tab 的精确 `Name` 找到可见 `ControlType.TabItem`，执行 `SelectionItemPattern.Select()`。
5. 用 `SelectionItemPattern.Current.IsSelected=True` 分别验证主 Tab 和子 Tab。

快速切换 Tab 脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\switch-target-fitting-tab.ps1" -MainTab "<Client|Instruments|Fitting|顾客|设备|验配>" -SubTab "<子Tab名称>"
```

脚本限制：

- `-ListAvailable` 输出脚本固化的主 Tab 和子 Tab 名称。
- `-DryRun` 只验证目标窗口和参数，不切换界面。
- 主 Tab 可用英文别名或中文名；子 Tab 可用 UI 可见中文名，常见英文别名会规范化为 UIA 名称。
- 如果 Target 当前不在顾客验配会话，脚本会找不到 `Fitting.*TabItem` 并停止。

## 验配会话 > 顾客详情页

进入 `顾客 / 详情` 后，当前已验证的用户同意区域：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 用户同意分组 | `ControlType.Group`, `Name=用户同意`, `ClassName=GroupBox` | 显示数据储存同意说明和同意状态。 | 用于确认详情页中部区域上下文。 |
| 是 | `ControlType.RadioButton`, `AutomationId=YesRadioButton`, `ClassName=RadioButton` | 用户同意开启数据储存。 | 支持 `SelectionItemPattern`；选中后应读回 `IsSelected=True`。 |
| 否 | `ControlType.RadioButton`, `AutomationId=NoRadioButton`, `ClassName=RadioButton` | 用户不同意开启数据储存。 | 支持 `SelectionItemPattern`；选中后应读回 `IsSelected=True`。 |

快速设置用户同意脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-client-consent.ps1" -Consent <Yes|No>
```

脚本限制：

- 默认先切到 `顾客 / 详情`，再定位 `YesRadioButton` 和 `NoRadioButton`。
- 可用 `-GetOnly` 只读取当前状态。
- 可用 `-DryRun` 只验证目标窗口、页面和目标状态，不修改同意状态。
- 可用 `-NoEnsureDetailsTab` 跳过自动切页，但调用方必须先确保当前页面已是顾客详情页。

听力图关键控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 右耳听力图 | `ClassName=AudiogramControl`, `AutomationId=audiogramControl`；与 `AutomationId=Fitting.PatientArea.Audiogram.TinnitusExpanderRight` 横向邻近 | 患者右耳曲线图。 | 当前在屏幕左侧；不要按屏幕左右命名。 |
| 左耳听力图 | `ClassName=AudiogramControl`, `AutomationId=audiogramControl`；与 `AutomationId=Fitting.PatientArea.Audiogram.TinnitusExpanderLeft` 横向邻近 | 患者左耳曲线图。 | 当前在屏幕右侧；不要按屏幕左右命名。 |
| AC | `AutomationId=Fitting.PatientArea.Audiogram.AcRadioButton`, `ControlType.RadioButton` | 选择气导输入模式。 | 写 AC 前先对它执行 `SelectionItemPattern.Select()`。 |
| BC | `AutomationId=Fitting.PatientArea.Audiogram.BcRadioButton`, `ControlType.RadioButton` | 选择骨导输入模式。 | 写 BC 前先对它执行 `SelectionItemPattern.Select()`。 |
| UCL | `AutomationId=Fitting.PatientArea.Audiogram.UclRadioButton`, `ControlType.RadioButton` | 选择不舒适阈输入模式。 | 写 UCL 前先对它执行 `SelectionItemPattern.Select()`。 |
| 使用听力图 | `ControlType.RadioButton`, `Name=使用听力图`，位于各耳图下方 | 启用该耳听力图。 | 可用耳侧图位置区分左右；修改前确认目标耳侧。 |
| 听力图测量条件 | `ControlType.ComboBox`, `ClassName=ComboBox`, `AutomationId=""`，位于各耳图下方日期框右侧 | 选择该耳听力图的测量条件/换能器类型。 | 通过与患者左/右耳 `AudiogramControl` 的横向邻近关系定位；不要使用屏幕左右当作耳侧。 |

`AudiogramControl` 经验：

- 控件暴露 `ValuePattern`，读回值形如 `<GraphControl><Coordinates><AirCouplingData>...</AirCouplingData><BoneCouplingData /><UncomfortableLevelData /></Coordinates></GraphControl>`。
- `AirCouplingData`、`BoneCouplingData` 与 `UncomfortableLevelData` 中的点使用 `<Point><X>频率</X><Y>dB</Y></Point>`。
- 经验证，`ValuePattern.SetValue()` 不会实际覆盖或清空曲线；有效写入方式是先选 AC 或 BC，再点击图表点位。
- 同一频率再次点击可以更新该频率的 dB；空 XML 不会清空已有点。
- 鼠标悬停在图内时，UIA 会临时出现类似 `500Hz, 25dB` 的 `ControlType.Text`，可用于调试坐标映射。
- 写入后以 `ValuePattern.Current.Value` 的 XML 为验证来源，不以视觉点位为唯一判断。
- 感音神经性听损案例应体现“无明显气骨导差”，不是让 AC 与 BC 机械完全重合；BC 可与 AC 接近，并保留 0-10 dB 的合理小差异。

听力图测量条件下拉框经验：

- 两个下拉框没有稳定 `AutomationId`；用 `ClassName=ComboBox`、空 `AutomationId`、位于 `AudiogramControl` 底部下方、并与目标耳图横向邻近来定位。
- 当前 UIA 读回的候选项为 `Tdh`, `ER3`, `ER3Custom`, `LS0`, `LS45`, `LS90`。
- ComboBox 支持 `ExpandCollapsePattern` 和 `SelectionPattern`；展开后会出现重复的 `ListItem` 节点，应选择支持 `SelectionItemPattern` 的项。
- 写入后以 ComboBox 的 `SelectionPattern.GetSelection()` 读回值作为验证来源。

快速输入 AC/BC/UCL 听力图脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-audiogram.ps1" -LeftAc "<频率=dB,...>" -RightAc "<频率=dB,...>" -LeftBc "<频率=dB,...>" -RightBc "<频率=dB,...>" -LeftUcl "<频率=dB,...>" -RightUcl "<频率=dB,...>"
```

脚本限制：

- 只更新传入的频率点；未传入的旧点会保留。
- 支持频率为 `125`, `250`, `500`, `750`, `1k`, `1.5k`, `2k`, `3k`, `4k`, `6k`, `8k`。
- 支持 dB 为 `0..120` 的 5 dB 步进。
- 可先用 `-DryRun` 查看计划坐标；`-Precheck` 只作为调试提示，已有点位可能让悬停文本出现旧读数，最终仍以 XML 读回验证为准。

快速选择测量条件脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chord\Desktop\FAI\phonak-target-control\scripts\set-target-audiogram-condition.ps1" -LeftCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>" -RightCondition "<Tdh|ER3|ER3Custom|LS0|LS45|LS90>"
```

脚本限制：

- 参数按患者耳侧命名，不按屏幕左右命名。
- 可用 `-BothCondition` 同时设置双耳。
- 可用 `-ListAvailable` 输出可用条件；可用 `-DryRun` 查看计划操作。

## 底部 Home 功能入口

这些入口在 UIA 中是 `TabItem`，但可访问 `Name` 不完整；作用主要由内部 `ControlPlaceholder<...>` 类名推断。

切换底部入口时，先定位 `AutomationId=Home.HomeTabControl`，在其子级 `TabItem` 中按屏幕横向从左到右排序，再对目标项使用 `SelectionItemPattern.Select()` 或可用的 Invoke/鼠标点击方式。切换后必须重新抓 `ControlView`，用页面容器类名和页面文本确认结果。

| 位置 | Microsoft UIA 识别线索 | 推断作用 |
|---:|---|---|
| 1 | `ControlPlaceholder<PatientManagementView>` + `Text Name=Clients & sessions` | 客户与会话管理，当前选中。 |
| 2 | 可见标签 `Demonstrator`；`ControlPlaceholder<DemonstrationThumbView>` | 演示功能入口。 |
| 3 | 可见标签 `Media`；`ControlPlaceholder<MediaPlayerThumbView>` | 媒体播放入口。 |
| 4 | 可见标签 `Trial & tools`；`ControlPlaceholder<ProductSetupThumbView>` | 试用助听器与工具入口；`ProductSetup...` 是 UIA 内部类名，不是底部可见标签。 |
| 5 | `ControlPlaceholder<UpdatesThumbView>` | Updates / 更新入口。 |
| 6 | 可见标签 `Setup`；`ControlPlaceholder<PreferencesThumbView>` | 设置入口；`Preferences...` 是 UIA 内部类名，不是底部可见标签。 |

## 底部入口页面明细

### 1. Clients & sessions

主页面容器为 `ControlPlaceholder<PatientManagementView>` / `ClassName=PatientManagementView`。该页是客户、会话和报告入口，已在“Clients & sessions 区域按钮”中列出主要按钮。

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 页面确认文本 | `ControlType.Text`, `AutomationId=Home.PatientManagementTextBlock`, `Name=Clients & sessions` | 确认当前底部入口为客户与会话页。 | 切换入口后用它验证页面。 |
| New client... | `AutomationId=Home.PatientManagement.NewPatientButton`, `ControlType.Button` | 创建新客户。 | 可用 `InvokePattern`。进入创建流程后继续重新抓树。 |
| SearchBox | `AutomationId=PART_SearchBox`, `ControlType.Edit` | 客户搜索输入框。 | 设置文本后重新验证 `Search` 是否启用。 |
| Show all | `AutomationId=Home.PatientManagement.ShowAllButton` 或 `Home.PatientManagement.PatientList.ShowAllButton` | 显示全部客户。 | 页面中存在顶部和空状态两个同名按钮，优先用 `AutomationId` 区分。 |
| PatientListView | `AutomationId=Home.PatientManagement.PatientListView`, `ControlType.DataGrid`, `ClassName=ListView` | 历史客户列表。 | 必须先点击 `Show all` 才出现；子项可用 `SelectionItemPattern.Select()` 选择。 |
| Open session | `AutomationId=Home.PatientManagement.OpenSessionButton`, `ControlType.Button` | 打开已选客户/会话。 | 有会话时选择会话行后启用并支持 `InvokePattern`；无会话客户要双击客户行。 |
| New session | `AutomationId=Home.PatientManagement.NewSessionButton`, `ControlType.Button` | 为已选客户创建新会话。 | 无选择时禁用；选择客户行后启用并支持 `InvokePattern`。 |

### 2. Demonstrator

主页面容器为 `ControlPlaceholder<DemonstrationView>` / `ClassName=DemonstrationView`。当前环境显示媒体集合未安装。

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 页面容器 | `ControlType.Custom`, `ClassName=DemonstrationView` | 演示页主体。 | 用于确认底部第 2 个入口已打开。 |
| 未安装提示 | `ControlType.Text`, `Name=Media files for "Benefit demonstrator" not installed` | 提示 Benefit demonstrator 媒体文件未安装。 | 只读状态提示。 |
| Download media collection | `ControlType.Button` 且子级文本包含 `Download media collection` 与 `(Phonak Target Sounds)` | 下载演示媒体集合。 | 按钮本身 `Name` 为空、无稳定 `AutomationId`；需要通过子级文本和父按钮关系定位。会下载媒体包，执行前确认用户目标。 |

### 3. Media

主页面容器为 `ControlPlaceholder<MediaPlayerView>` / `ClassName=MediaPlayerView`。该页用于管理和播放媒体场景。

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 页面容器 | `ControlType.Custom`, `ClassName=MediaPlayerView`, `Name=Add scene...` | 媒体播放器页主体。 | 用于确认底部第 3 个入口已打开。 |
| Add scene... | `ControlType.Button`, `Name=Add scene...` | 添加媒体场景。 | 无稳定 `AutomationId`；可能打开文件/媒体选择流程，执行前确认目标。 |
| 搜索/筛选输入框 | `ControlType.Edit`, `ClassName=TextBox`, 无 `AutomationId` | 过滤媒体或场景列表。 | 需要用页面容器上下文定位，避免误选其他输入框。 |
| 分类树 | `ControlType.Tree`, `AutomationId=PART_CategoriesTree` | 媒体分类列表。 | 子项 `Name` 目前是内部类型名，选择后需重新验证可见场景。 |
| 场景列表 | `ControlType.List`, `AutomationId=PART_ScenesList` | 媒体场景列表。 | 当前为空或未选择时矩形可能为空。 |
| No scene selected | `ControlType.Text`, `Name=No scene selected` | 当前没有选中场景。 | 只读状态提示。 |
| 选项下拉 | `ControlType.ComboBox`, 无 `AutomationId`，另有 `AutomationId=PART_PopupContentControl` | 媒体选项/弹出内容宿主。 | 一个下拉在当前状态为禁用；修改前先确认当前页面状态。 |

### 4. Trial & tools

底部可见标签为 `Trial & tools`；主页面容器为 `ControlPlaceholder<ProductSetupView>` / `ClassName=ProductSetupView`。`ProductSetup...` 是 UIA 内部类名。内部有 `AutomationId=Home.Tools.ToolsTabControl` 的工具分类页签。

| 分类 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Trial hearing aids | `ControlType.TabItem`, `AutomationId=Home.Tools.TrialHearingInstruments.TrialHearingInstrumentsTabItem`, `Name=Trial hearing aids` | 试用助听器配置。 | 默认选中；右侧出现 `Configure...` 与清洁指南按钮。 |
| Measurement settings | `ControlType.TabItem`, `AutomationId=Home.Tools.TestSettings.TestSettingsTabItem`, `Name=Measurement settings` | 测量设置入口。 | 切换后重新抓树确认右侧内容。 |
| Firmware update | `ControlType.TabItem`, `AutomationId=Home.Tools.FirmwareUpdate.FirmwareUpdateTabItem`, `Name=Firmware update` | 固件更新入口。 | 可能涉及设备更新，不要自动执行更新动作。 |
| Reset / Stock mode | `ControlType.TabItem`, `AutomationId=Home.Tools.ResetRepair.ResetToFactorySettingsTabItem`, `Name=Reset / Stock mode` | 重置或库存模式入口。 | 具有改变设备/数据状态的风险，必须确认。 |
| Warranty | `ControlType.TabItem`, `Name=Warranty` | 保修信息入口。 | 当前未见稳定 `AutomationId`，用 `Name + 父 TabControl` 定位。 |
| Device pairing | `ControlType.TabItem`, `AutomationId=Home.Tools.DevicePairing.DevicePairingTabItem`, `Name=Device pairing` | 设备配对入口。 | 可能改变设备连接状态，执行前确认。 |
| Device language | `ControlType.TabItem`, `AutomationId=Home.Tools.DeviceLanguage.DeviceLanguageTabItem`, `Name=Device language` | 设备语言入口。 | 可能改变设备语言，执行前确认。 |
| Device diagnostics | `ControlType.TabItem`, `AutomationId=Home.Tools.DeviceLanguage.DeviceDiagnosticTabItem`, `Name=Device diagnostics` | 设备诊断入口。 | 用于诊断；连接真实设备前需确认目标。 |

`Trial hearing aids` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Configure trial hearing aids | `ControlType.Text`, `Name=Configure trial hearing aids` | 右侧说明标题。 | 用于确认当前分类内容。 |
| Configure... | `ControlType.Button`, `Name=Configure...` | 配置试用助听器性能级别。 | 无稳定 `AutomationId`；可能打开配置对话框，执行后重新抓树。 |
| Cleaning & disinfection guide | `ControlType.Button`, `Name=Cleaning & disinfection guide` | 打开试用助听器清洁消毒指南。 | 可能打开文档或说明窗口。 |

### 5. Updates

主页面容器为 `ControlPlaceholder<UpdatesView>` / `ClassName=UpdatesView`。当前显示可下载的 `Phonak Target Sounds 12.0`。

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| 页面容器 | `ControlType.Custom`, `ClassName=UpdatesView` | 更新页主体。 | 用于确认底部第 5 个入口已打开。 |
| 更新详情 | `ControlType.Pane`, `Name=Phonak Target Sounds 12.0` | 右侧更新详情区域。 | 包含版本 `12.0`、大小 `1,093.1MB`。 |
| Name / Status 列 | `ControlType.Text`, `Name=Name` 与 `Name=Status` | 更新列表表头。 | 用于确认列表区域。 |
| Phonak Target Sounds 12.0 | `ControlType.Text`, `Name=Phonak Target Sounds 12.0` | 可下载媒体包条目。 | 与 Demonstration 的缺失媒体提示相关。 |
| Download | `ControlType.Button`, `Name=Download` | 下载所选更新/媒体包。 | 会触发下载；执行前确认用户目标。 |
| 后台下载提示 | `ControlType.Text`, `Name=You can work normally with Phonak Target while downloads are processed in the background.` | 提示下载在后台处理。 | 只读提示。 |

### 6. Setup

底部可见标签为 `Setup`；主页面容器为 `ControlPlaceholder<PreferencesView>` / `ClassName=PreferencesView`。`Preferences...` 是 UIA 内部类名。内部主页签为 `AutomationId=Home.Preferences.PreferencesTabControl`；顶部图标页签的可访问 `Name` 多为内部模型名，不适合作为唯一定位依据。进入后优先通过左侧分类文本确认上下文。

Setup 顶部大类均是 `ControlType.TabItem`，常见 `Name=Sonova.Kona.Modularity.PreferencesProvider.UserInterface.PreferencesItemModel`。可见标签不总是作为 `Name` 暴露；按顶部从左到右的位置和切换后的内容共同确认。

| 顶部大类 | Microsoft UIA 定位线索 | 当前确认内容 | 自动化注意事项 |
|---|---|---|---|
| General | `Home.Preferences.PreferencesTabControl` 下第 1 个顶部 `TabItem` | 左侧含 `Language`, `Presentation`, `My profile`, `Import/export settings`, `Support`, `Support tools`。 | 修改语言、显示、导入导出前先确认目标。 |
| Fitting session | `Home.Preferences.PreferencesTabControl` 下第 2 个顶部 `TabItem`；可见标签 `Fitting session` | 左侧含 `Diagnostics`, `Instruments`, `Fitting`, `Easy navigation`, `AudiogramDirect`, `Presentation`。当前已确认 `Diagnostics` 主区。 | 多数控件无稳定 `AutomationId`；用顶部第 2 项、左侧分类文本和右侧分组名共同确认。 |
| Junior mode | 顶部可见标签 `Junior mode` | 已观察到 `Diagnostics`、`Defaults`、`Fitting formula`、`Program manager` 等 Junior 默认设置内容。 | 多数会影响 Junior mode 默认规则，修改前确认。 |
| Reports | 顶部可见标签 `Reports` | 首屏为 `Layout`，含报告布局单选项和预览区域。 | 布局设置会影响报告输出。 |
| Fitting device | 顶部可见标签 `Fitting device` | 首屏为 `Noahlink Wireless`，含启用复选框、连接检查按钮和连接状态。 | `Check` 会检查设备/连接状态；执行前确认。 |
| Sound system | 顶部可见标签 `Sound system` | 首屏为 `Sound output`，含声输出设备单选项。 | 声音系统设置会影响媒体/校准输出。 |
| Remote Support & Internet | 顶部可见标签 `Remote Support & Internet` | 首屏为 `Internet services`，含联网测试、在线服务、更新和后台下载选项。 | 联网测试、在线服务、更新策略会触发外部连接或状态改变。 |
| Developer | 顶部可见标签 `Developer` | 首屏含 Performance、Communication、Sound calibration、Visualization、Debugging、Emulation 等内部开关。 | 内部开关可能影响启动、通信、日志和仿真行为，除非用户明确要求不要改。 |

`Fitting session` 左侧分类：

| 分类 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Diagnostics | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Diagnostics` | 诊断设置入口。 | 当前已确认右侧包含测量条件、骨导符号、ABR 和修正值。 |
| Instruments | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Instruments` | 仪器设置入口。 | 切换后重新抓树确认右侧内容。 |
| Fitting | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Fitting` | 验配设置入口。 | 切换后重新抓树确认右侧内容。 |
| Easy navigation | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Easy navigation` | 简易导航设置入口。 | 切换后重新抓树确认右侧内容。 |
| AudiogramDirect | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=AudiogramDirect` | AudiogramDirect 设置入口。 | 切换后重新抓树确认右侧内容。 |
| Presentation | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Presentation` | Fitting session 展示设置入口。 | 与 General 下的 `Presentation` 同名，必须先确认顶部大类是 `Fitting session`。 |

`Fitting session > Diagnostics` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Diagnostics 组 | `ControlType.Group`, `Name=Diagnostics`, `ClassName=GroupBox` | Fitting session 诊断设置主区。 | 用于确认当前顶部大类和左侧分类。 |
| Default measurement condition | `ControlType.Text`, `Name=Default measurement condition` + 后续 `ControlType.ComboBox`, `ClassName=ComboBox` | 默认测量条件。 | 下拉框支持 `SelectionPattern` 和 `ExpandCollapsePattern`；当前 UIA 选择项为 `ER3`，可见下拉文本为 `Insert earphone`。 |
| Bone conduction symbol | `ControlType.Text`, `Name=Bone conduction symbol` + 两个后续 `ControlType.RadioButton` | 骨导符号左右显示规则。 | 单选按钮无稳定 `Name`；当前第 1 个 `RadioButton` 为选中，第 2 个未选中。 |
| Use Auditory Brainstem Response (ABR) | `ControlType.CheckBox`, `Name=Use Auditory Brainstem Response (ABR)` | 是否使用 ABR。 | 支持 `TogglePattern`；当前 `ToggleState=Off`。 |
| DSL v5a - ABR nHL correction values | 文本 `DSL v5a - ABR nHL correction values` + 10 个 `ControlType.Edit`, `ClassName=TextBox` | 各频率 ABR nHL 修正值。 | 文本框支持 `ValuePattern`；按频率邻近关系定位，当前值为 `250=30`, `500=20`, `750=17`, `1k=15`, `1.5k=12`, `2k=10`, `3k=7`, `4k=5`, `6k=5`, `8k=5`。 |
| Reset | `ControlType.Button`, `Name=Reset`, `ClassName=Button` | 重置 ABR 修正值。 | 支持 `InvokePattern`；会改变表格值，执行前确认。 |

`General` 左侧分类：

| 分类 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Language | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Language` | 语言设置。 | 当前已验证右侧包含 Fitting software 与 Media 下拉框。 |
| Presentation | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Presentation` | 展示相关偏好入口。 | 切换后重新抓树确认右侧内容。 |
| My profile | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=My profile` | 个人资料入口。 | 可能包含账号/个人信息，避免自动提交。 |
| Import/export settings | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Import/export settings` | 导入/导出设置入口。 | 可能读写文件，执行前确认路径和目标。 |
| Support | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Support` | 支持设置入口。 | 可能涉及在线支持或服务配置，执行前确认。 |
| Support tools | `ControlType.TabItem`，子级 `ControlType.Text`, `Name=Support tools` | 支持工具入口。 | 可能触发诊断/支持工具，执行前确认。 |

`Language` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Language 组 | `ControlType.Group`, `Name=Language` | 语言设置分组。 | 用于确认当前分类内容。 |
| Fitting software | `ControlType.Text`, `Name=Fitting software` + 后续 `ControlType.ComboBox` | 验配软件语言下拉。 | 下拉框无稳定 `AutomationId`；用标签文本和邻近关系定位。修改会改变软件语言。 |
| Media | `ControlType.Text`, `Name=Media` + 后续 `ControlType.ComboBox` | 媒体语言下拉。 | 下拉框无稳定 `AutomationId`；修改会影响媒体语言。 |
| 弹出内容宿主 | `ControlType.ComboBox`, `AutomationId=PART_PopupContentControl` | 下拉弹出内容宿主。 | 通常不作为首选目标；优先操作标签后的实际下拉框。 |

`Presentation` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Presentation 组 | `ControlType.Group`, `Name=Presentation` | 展示偏好分组。 | 用于确认当前分类内容。 |
| Toolbar color | `ControlType.Text`, `Name=Toolbar color` + 后续 `ControlType.ComboBox` | 工具栏颜色下拉；当前可见值为 `Dark`。 | 下拉框无稳定 `AutomationId`；用标签文本和邻近关系定位。修改会改变界面显示风格。 |
| Show "Client view" on second screen | `ControlType.CheckBox`, `Name=Show "Client view" on second screen` | 是否在第二屏显示 Client view。 | 当前为勾选状态；切换会改变双屏显示行为。 |

`My profile` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| My profile 组 | `ControlType.Group`, `Name=My profile` | 个人资料设置分组。 | 包含个人和机构信息，写入前确认。 |
| Last name / First name / Company | 标签文本后续 `ControlType.Edit` | 姓、名、公司。 | 文本框无稳定 `AutomationId`，按标签邻近关系定位。 |
| Address 1 / Address 2 / State / City / Zip | 标签文本后续 `ControlType.Edit` | 地址信息。 | 属于个人/机构信息，写入前确认。 |
| Phone / Email address | 标签文本后续 `ControlType.Edit` | 电话和邮箱。 | 属于联系方式，写入前确认。 |

`Import/export settings` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Import settings | `ControlType.Group`, `Name=Import settings` | 导入设置分组。 | 会覆盖当前 Setup 设置。 |
| Import... | `ControlType.Button`, `Name=Import...` | 从文件导入并覆盖当前设置。 | 会打开文件选择并改变配置，执行前确认文件路径和意图。 |
| Export settings | `ControlType.Group`, `Name=Export settings` | 导出设置分组。 | 导出当前 Setup 设置。 |
| Export... | `ControlType.Button`, `Name=Export...` | 导出当前设置到文件。 | 会写入文件，执行前确认目标路径。 |
| Excluded settings | `ControlType.Text`, `Name=Excluded settings: Language, my profile, protected fitting, and sound system.` | 导入/导出排除项说明。 | 只读提示。 |

`Support` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Support 组 | `ControlType.Group`, `Name=Support` | 支持设置分组。 | 用于确认当前分类内容。 |
| Support number | `ControlType.Text`, `Name=Support number` + `ControlType.Edit`, `AutomationId=Home.Preferences.General.Support.SupportNumberTextBox` | 支持电话号码输入框。 | 修改前确认号码内容。 |
| Support number list | `ControlType.List`, `AutomationId=Home.Preferences.General.Support.SupportNumberListBox` | 支持号码列表。 | 选择项后重新抓树确认状态。 |

`Support tools` 当前可见控件：

| 区域 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Support tools 组 | `ControlType.Group`, `Name=Support tools` | 支持工具集合。 | 页面提示不建议在无客户支持时运行这些工具。 |
| USB drivers | 文本 `USB drivers`；按钮 `Check`, `Uninstall`, `Install` | 检查、卸载、安装 USB 驱动。 | 会影响本机驱动，除非用户明确要求不要执行。 |
| Bluetooth | 文本 `Bluetooth`；按钮 `Check` | 检查蓝牙状态。 | 会触发本机检查。 |
| Fonts | 文本 `Fonts`；按钮 `Check` | 检查字体。 | 通常为诊断检查。 |
| WMI check | 文本 `WMI check`；按钮 `Quick check`, `Extended check` | 快速或扩展 WMI 检查。 | 会运行诊断检查。 |
| Noah | 文本 `Noah`；按钮 `Register`, `Unregister` 当前禁用 | Noah 注册/注销。 | 禁用状态不要强行操作。 |
| Printers | 文本 `Printers`；按钮 `Get via queue`, `Get via settings`, `View default` | 查看打印机队列、设置和默认打印机。 | 只读查看相对安全；仍需重新验证结果。 |

`Junior mode > Diagnostics` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Diagnostics 组 | `ControlType.Group`, `Name=Diagnostics` | Junior mode 诊断设置。 | 用于确认当前顶部大类和左侧分类。 |
| Default measurement condition | `ControlType.Text`, `Name=Default measurement condition` + 后续 `ControlType.ComboBox` | 默认测量条件。 | 修改会影响默认诊断条件。 |
| Bone conduction symbol | `ControlType.Text`, `Name=Bone conduction symbol` + 后续 `ControlType.RadioButton` | 骨导符号左右选项。 | 该区域有左右相关单选项，选择前确认目标侧。 |
| Use Auditory Brainstem Response (ABR) | `ControlType.CheckBox`, `Name=Use Auditory Brainstem Response (ABR)` | 是否使用 ABR。 | 会影响 DSL v5a ABR 修正值是否参与。 |
| DSL v5a - ABR nHL correction values | 多个 `ControlType.Edit`, 邻近频率 `250`, `500`, `750`, `1k`, `1.5k`, `2k`, `3k`, `4k`, `6k`, `8k` | 各频率 ABR nHL 修正值。 | 当前值显示为 `0`；修改前确认频率和值。 |
| Reset | `ControlType.Button`, `Name=Reset` | 重置 ABR 修正值。 | 会改变表格值，执行前确认。 |

`Junior mode > Defaults / Program manager` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Defaults 表 | 表头文本 `Defaults`, `0-3 years`, `4-8 years`, `9-12 years`, `13-18 years` | 按年龄段配置 Junior 默认项。 | 多列下拉框无稳定 `AutomationId`，按表头和行名定位。 |
| Acoustic parameters | `ControlType.Text`, `Name=Acoustic parameters` | 声学参数默认项分组。 | 修改会影响 Junior 默认声学配置。 |
| Fitting formula / Default fitting formula | 行文本 + 多个 `ControlType.ComboBox` | 不同年龄段默认验配公式。 | 修改前确认年龄段。 |
| Program manager | 行文本 `Program manager`；含 `Startup`, `Automatic programs`, `First priority`, `Second priority`, `Third priority` | Junior 默认程序管理。 | 下拉框与单选项较多，按行列邻近关系定位。 |
| Reset to DSL defaults / Reset to NAL defaults | `ControlType.Button`, `Name=Reset to DSL defaults` / `Reset to NAL defaults` | 重置为 DSL 或 NAL 默认值。 | 会批量改变 Junior 默认设置，执行前确认。 |

`Reports > Layout` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Layout 组 | `ControlType.Group`, `Name=Layout` | 报告布局设置。 | 用于确认当前顶部大类内容。 |
| Standard layout | `ControlType.RadioButton`, `Name=Standard layout` | 使用标准报告布局。 | 单选项会改变报告版式。 |
| Customized layout | `ControlType.RadioButton`, `Name=Customized layout` | 使用自定义报告布局。 | 单选项会改变报告版式。 |
| Preprinted letterhead | `ControlType.RadioButton`, `Name=Preprinted letterhead` | 使用预印信头。 | 会影响报告打印/导出布局。 |
| Preview | `ControlType.Group`, `Name=Preview` | 报告预览区域。 | 只读预览区域。 |

`Reports > Curve type` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Curve type 组 | `ControlType.Group`, `Name=Curve type` | 报告曲线类型设置。 | 用于确认当前分类内容。 |
| Gain | `ControlType.RadioButton`, `Name=Gain` + 邻近禁用 `ControlType.ComboBox` | 使用增益曲线。 | 当前关联下拉框显示禁用。 |
| Output | `ControlType.RadioButton`, `Name=Output` + 邻近 `ControlType.ComboBox` | 使用输出曲线。 | 单选和下拉会改变报告曲线显示。 |

`Fitting device > Noahlink Wireless` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Noahlink Wireless 组 | `ControlType.Group`, `Name=Noahlink Wireless` | Noahlink Wireless 连接设置。 | 用于确认当前顶部大类内容。 |
| Enable "Noahlink Wireless" for fitting | `ControlType.CheckBox`, `Name=Enable "Noahlink Wireless" for fitting` | 是否启用 Noahlink Wireless 验配。 | 切换会影响验配设备选择。 |
| Check | `ControlType.Button`, `Name=Check` | 检查已连接的 Noahlink Wireless。 | 会触发连接检查，执行前确认。 |
| Connected "Noahlink Wireless" | `ControlType.Text`, `Name=Connected "Noahlink Wireless"` | 连接设备状态标题。 | 只读状态信息。 |
| Connection not checked | `ControlType.Text`, `Name=Connection not checked` | 连接尚未检查。 | 只读状态信息。 |

`Fitting device` 其他设备页当前可见控件：

| 页面 | Microsoft UIA 定位信息 | 已确认控件 | 自动化注意事项 |
|---|---|---|---|
| Noahlink | `ControlType.Group`, `Name=Noahlink` | `Enable Noahlink for fitting`; 禁用 `Properties...`; 禁用 `Pairing...`; `Check`; `Connected Noahlink`; `Connection not checked` | 启用、配对、检查会影响设备连接流程。 |
| iCube | `ControlType.Group`, `Name=iCube` | `Enable iCube II for fitting`; `Pairing assistants`; `iCube II USB adapter`; `Pairing...`; `Third party adapter`; `Connected iCubes`; `Check`; `Connection not checked` | 配对和检查会访问连接设备。 |
| HI-PRO | `ControlType.Group`, `Name=HI-PRO` | `Enable HI-PRO for fitting`; `Configuration...`; `Check`; `Connected HI-PRO`; `Connection not checked` | 配置和检查会影响验配设备连接。 |

`Sound system > Sound output` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Sound output 组 | `ControlType.Group`, `Name=Sound output` | 声音输出方式设置。 | 用于确认当前顶部大类内容。 |
| Stereo loudspeaker / AURICAL Aud | `ControlType.RadioButton`, `Name=Stereo loudspeaker / AURICAL Aud` | 选择立体声扬声器或 AURICAL Aud 输出。 | 单选会改变声音输出。 |
| Surround system 5.1 | `ControlType.RadioButton`, `Name=Surround system 5.1` | 选择 5.1 环绕输出。 | 单选会改变声音输出。 |
| AURICAL / AURICAL Plus | `ControlType.RadioButton`, `Name=AURICAL / AURICAL Plus` | 选择 AURICAL / AURICAL Plus 输出。 | 单选会改变声音输出。 |
| Calibration | `ControlType.Text` 或分类文本 `Name=Calibration` | 校准设置入口。 | 需要切换后重新抓树确认控件。 |

`Sound system > Calibration` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Volume adjustment | `ControlType.Group`, `Name=Volume adjustment` | 音量调整/校准区域。 | 用于确认当前分类内容。 |
| Manual calibration | `ControlType.RadioButton`, `Name=Manual calibration: Play calibration sound and adjust volume until you reach 80 dB SPL` | 手动校准模式。 | 可能播放校准音；执行前确认。 |
| Play calibration sound | `ControlType.Button`, `AutomationId=PlayButton`, 当前禁用 | 播放校准音。 | 禁用状态不要操作；启用后会发声。 |
| Windows volume | `ControlType.Text`, `Name=Windows volume` + 邻近 `ControlType.Slider` | Windows 音量滑块。 | 修改会改变系统/应用音量。 |
| Automatic calibration: Via hearing aid | `ControlType.RadioButton`, `Name=Automatic calibration: Via hearing aid` | 通过助听器自动校准。 | 可能需要连接设备。 |
| Save the volume adjustment... | `ControlType.CheckBox`, `Name=Save the volume adjustment and restore it on startup of Phonak Target` | 保存并在启动时恢复音量调整。 | 修改会改变启动行为。 |

`Remote Support & Internet > Internet services` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Internet services | `ControlType.Text`, `Name=Internet services` | 互联网服务设置页。 | 用于确认当前顶部大类内容。 |
| Test internet connection | `ControlType.Button`, `Name=Test internet connection` | 测试互联网连接。 | 会发起联网检查，执行前确认。 |
| Enable online services | `ControlType.CheckBox`, `Name=Enable online services` | 是否启用在线服务。 | 切换会改变在线服务状态。 |
| Automatically check for updates | `ControlType.CheckBox`, `Name=Automatically check for updates` | 是否自动检查更新。 | 切换会改变更新策略。 |
| Download in background | `ControlType.CheckBox`, `Name=Download in background` | 是否后台下载。 | 切换会改变下载行为。 |
| Proxy settings | `ControlType.Text`, `Name=Proxy settings` | 代理设置入口。 | 需要切换后重新抓树确认控件。 |
| Remote Support | `ControlType.Text`, `Name=Remote Support` | 远程支持入口。 | 可能涉及远程支持流程，执行前确认。 |

`Remote Support & Internet > Proxy settings` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Test internet connection | `ControlType.Button`, `Name=Test internet connection` | 测试代理/联网状态。 | 会发起联网检查。 |
| No proxy | `ControlType.RadioButton`, `Name=No proxy` | 不使用代理。 | 修改会改变网络配置。 |
| Automatically detect proxy settings | `ControlType.RadioButton`, `Name=Automatically detect proxy settings` | 自动检测代理。 | 修改会改变网络配置。 |
| Manual proxy configuration | `ControlType.RadioButton`, `Name=Manual proxy configuration` | 手动代理配置。 | 后续可能出现代理地址/端口字段，需重新抓树。 |

`Remote Support & Internet > Remote Support` 当前可见控件：

| 控件 | Microsoft UIA 定位信息 | 作用 | 自动化注意事项 |
|---|---|---|---|
| Previous result | `ControlType.Button`, `Name=Previous result`, 当前禁用 | 查看上次连接测试结果。 | 禁用状态不要操作。 |
| Connection test | `ControlType.Button`, `Name=Connection test` | 远程支持连接测试。 | 会发起联网测试，执行前确认。 |
| Allow connections without the integrated audio/video... | `ControlType.CheckBox`, 完整 `Name` 以该文本开头 | 允许不使用集成音视频连接。 | 会改变 Remote Support 行为。 |

`Developer` 当前可见控件：

| 分组 | Microsoft UIA 定位信息 | 已确认控件 | 自动化注意事项 |
|---|---|---|---|
| Performance | `ControlType.Group`, `Name=Performance` | `Enable Parallel Bootstrapping`; `Enable Screen Loading On Idle`; `Enable ControlPlaceholder Content Loading On Idle`; `Enable performance preparation (run on a low priority thread)` | 内部性能开关，修改会影响启动和加载行为。 |
| Communication | `ControlType.Group`, `Name=Communication` | `Enable PrepareFittingDevice`; `Enable prepare of HI-PRO`; `Enable Copain as fitting device`; `Enable RemoteLink as fitting device`; `Max Activation Thread Synchronization Timeout:` | 内部通信/设备开关，修改前确认。 |
| Product Data Caches | `ControlType.Text`, `Name=Product Data Caches - Max item count:` + 邻近增减按钮 | 产品数据缓存数量。 | 增减按钮无稳定文本，按标签邻近关系定位。 |
| Sound calibration | `ControlType.Group`, `Name=Sound calibration` | `Enable sound mixer restoring` | 改变声音校准恢复行为。 |
| Visualization | `ControlType.Group`, `Name=Visualization` | `Save and restore application window placement`; `Enable simplified fitting for Dalia` | 改变窗口位置恢复和特定产品显示行为。 |
| Debugging | `ControlType.Group`, `Name=Debugging` | `Verbose transaction logging`; `Enable WPF Tracing (Binding errors, etc.)` | 会改变日志/跟踪输出。 |
| Emulation | `ControlType.Group`, `Name=Emulation` | `Default emulate latest HI`; `Default emulate Measurement Software` | 会改变默认仿真行为。 |

## 状态栏

| 控件 | Microsoft UIA 定位信息 | 作用 |
|---|---|---|
| Startup time | `ControlType.Text`, `AutomationId=TextBlockStartupTime`, 例如 `Start: 4969 ms` | 启动耗时信息。 |
| Resolution | `ControlType.Text`, `Name` 类似 `Res: ...` | 当前 Target 内容区分辨率信息。 |
| Distributor | `ControlType.Text`, `Name` 类似 `Dist: US-Phonak` | 当前分销/地区配置。 |
| VCS Branch | `ControlType.Text`, `Name` 类似 `VCS Branch: master` | 当前构建分支信息。 |

## 推荐自动化策略

1. 用 PowerShell/.NET UIA 抓 `ControlView` 树。
2. 先确认窗口标题 `Phonak Target 12.0` 和根 `AutomationId=CocoonInternalMainWindow`。
3. 优先用 `AutomationId` 定位 Home 页关键控件：
   - `Home.PatientManagement.NewPatientButton`
   - `PART_SearchBox`
   - `Home.PatientManagement.ShowAllButton`
   - `Home.PatientManagement.PatientList.ShowAllButton`
4. 底部入口优先定位 `Home.HomeTabControl`，切换后用页面容器类名验证：
   - `PatientManagementView`
   - `DemonstrationView`（可见底部标签 `Demonstrator`）
   - `MediaPlayerView`（可见底部标签 `Media`）
   - `ProductSetupView`（可见底部标签 `Trial & tools`）
   - `UpdatesView`
   - `PreferencesView`（可见底部标签 `Setup`）
5. `Trial & tools` 内部优先定位 `Home.Tools.ToolsTabControl` 及其子级 `Home.Tools.*TabItem`。
6. `Setup` 内部优先定位 `Home.Preferences.PreferencesTabControl`，再用左侧分类文本确认上下文。
7. 验配会话内部优先定位 `Fitting.MainTabControl`；主 Tab 用 `Fitting.ClientTabItem`、`Fitting.InstrumentsTabItem`、`Fitting.FittingTabItem`，子 Tab 用当前主 Tab 下的精确可见 `Name`。
8. 对没有 `AutomationId` 的控件，使用 `ControlType + Name + 上下文父节点` 定位；对按钮 `Name` 为空但子级文本稳定的情况，先找文本再回溯父按钮。
9. 对底部功能入口，当前 `Name` 不可靠，优先用相对位置或内部类名推断，并在点击后重新验证页面内容。
10. 不要自动点击登录、关闭、报告发送、下载、固件更新、重置、设备配对、语言修改、文件导入/导出、或任何可能外发数据/改变设备状态/关闭工作的控件，除非用户明确要求。
