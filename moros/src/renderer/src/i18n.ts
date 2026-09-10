import type { AppLanguage } from "@shared/types";
import { useMoros } from "./store";

const zhCN = {
  "common.back": "返回",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.change": "更改",
  "common.save": "保存",
  "common.saving": "正在保存…",
  "common.remove": "移除",
  "common.add": "添加",
  "common.open": "打开",
  "common.insert": "插入",
  "common.refresh": "刷新",
  "common.copy": "复制",
  "common.copied": "已复制",
  "common.copyFailed": "复制失败",
  "common.active": "使用中",
  "common.use": "使用",
  "common.connected": "已连接",
  "common.notConfigured": "未配置",
  "common.notSelected": "未选择",
  "common.notSet": "未设置",
  "common.ready": "已就绪",
  "common.required": "必需",
  "common.working": "处理中…",
  "common.loading": "加载中…",
  "common.search": "搜索",
  "common.unknown": "未知",
  "common.today": "今天",
  "common.yesterday": "昨天",
  "common.now": "刚刚",
  "common.untitledSession": "未命名会话",
  "common.done": "完成",
  "common.viewImage": "查看大图",
  "common.closeImagePreview": "关闭预览",
  "error.avatarStorage": "头像无法保存到本地存储。",
  "error.imageRead": "无法读取这张图片。",
  "error.imageType": "请选择图片文件。",
  "error.imageSize": "头像图片不能超过 12 MB。",
  "error.imageDimensions": "图片尺寸无效。",
  "error.imageProcessing": "当前环境无法处理头像图片。",
  "language.label": "语言",
  "language.description": "选择 Moros 界面的显示语言。",
  "language.zh-CN": "简体中文",
  "language.zh-TW": "繁體中文",
  "language.en": "English",
  "language.de": "Deutsch",
  "titlebar.navigation": "导航控制",
  "titlebar.collapseSidebar": "折叠侧边栏",
  "titlebar.expandSidebar": "展开侧边栏",
  "titlebar.back": "后退",
  "titlebar.forward": "前进",
  "titlebar.globalMenu": "全局菜单",
  "titlebar.file": "文件",
  "titlebar.edit": "编辑",
  "titlebar.view": "视图",
  "titlebar.help": "帮助",
  "titlebar.newConversation": "新对话",
  "titlebar.openWorkspace": "打开工作区",
  "titlebar.settings": "设置",
  "titlebar.exit": "退出",
  "titlebar.focusComposer": "聚焦输入框",
  "titlebar.searchConversations": "搜索对话",
  "titlebar.developerContext": "开发者：当前上下文",
  "titlebar.providersModels": "Provider 与模型",
  "titlebar.skills": "技能",
  "titlebar.about": "关于 Moros",
  "titlebar.profile": "个人资料",
  "titlebar.minimize": "最小化",
  "titlebar.maximize": "最大化",
  "sidebar.new": "新建",
  "sidebar.search": "搜索",
  "sidebar.skills": "技能",
  "sidebar.sessions": "会话",





  "sidebar.noConversations": "暂无会话",
  "sidebar.legacyWorkspace": "旧版会话",
  "sidebar.sessionRunning": "会话正在运行",
  "sidebar.openRunningBeforeRemove": "请先进入正在运行的会话，再归档或删除",
  "sidebar.showMore": "显示更多",
  "sidebar.showLess": "收起",
  "sidebar.empty": "开始第一次对话后，会话会显示在这里。",
  "sidebar.confirmRename": "确认重命名",
  "sidebar.cancelRename": "取消重命名",
  "sidebar.moreActions": "更多操作",
  "sidebar.openProfile": "打开个人资料",
  "sidebar.contextUsage": "上下文用量",
  "sidebar.openWorkspace": "打开工作区",
  "sidebar.skillLibrary": "技能库",
  "sidebar.settings": "设置",
  "sidebar.rename": "重命名",
  "sidebar.archive": "归档",
  "sidebar.delete": "删除",
  "sidebar.copySessionId": "复制 Session ID",
  "sidebar.currentWorkspace": "当前",
  "sidebar.newInWorkspace": "在此工作区新建会话",
  "sidebar.pinWorkspace": "置顶工作区",
  "sidebar.unpinWorkspace": "取消置顶",
  "sidebar.copyWorkspacePath": "复制完整路径",
  "sidebar.revealInExplorer": "在文件资源管理器中打开",
  "sidebar.collapseWorkspace": "折叠工作区",
  "sidebar.expandWorkspace": "展开工作区",
  "sidebar.customizeWorkspace": "更改图标与颜色",



  "sidebar.resize": "调整侧边栏宽度",
  "sidebar.renameEmpty": "会话名称不能为空。",
  "sidebar.copyIdFailed": "复制 Session ID 失败",
  "settings.search": "搜索设置",
  "settings.category.personal": "个人设置",
  "settings.category.system": "系统与资源",
  "settings.category.ai": "AI 配置",
  "settings.navigation": "设置导航",
  "settings.nav.general": "通用",
  "settings.nav.generalDescription": "语言、快捷项与运行环境",
  "settings.nav.profile": "个人资料",
  "settings.nav.profileDescription": "身份与本地活动",
  "settings.nav.models": "Provider 与模型",
  "settings.nav.modelsDescription": "Provider 访问与模型选择",
  "settings.nav.skills": "技能",
  "settings.nav.skillsDescription": "Agent 能力",
  "settings.nav.dependencies": "依赖项",
  "settings.nav.dependenciesDescription": "运行环境与命令行工具",
  "settings.preferences": "Moros 偏好设置",
  "settings.general": "通用",
  "settings.generalDescription": "管理语言、快捷项与本地 Agent 运行环境。",
  "settings.commandExplanationLanguage": "Command 说明语言",
  "settings.commandExplanationLanguageDescription": "选择对话标题模型生成 Command 说明时使用的语言。",
  "settings.commandExplanationLanguageAuto": "跟随界面语言",
  "settings.composerSendKey": "发送方式",
  "settings.composerSendKeyDescription": "选择输入框中发送消息与换行使用的按键。",
  "settings.composerSendKeyEnter": "Enter 发送，Shift+Enter 换行",
  "settings.composerSendKeyShiftEnter": "Shift+Enter 发送，Enter 换行",
  "settings.appearance": "外观",
  "settings.appearanceDescription": "选择高对比浅色、深色，或自动跟随系统。",
  "settings.colorTheme": "颜色主题",
  "settings.theme.system": "系统",
  "settings.theme.systemDescription": "跟随操作系统",
  "settings.theme.light": "浅色",
  "settings.theme.lightDescription": "高对比浅色",
  "settings.theme.dark": "深色",
  "settings.theme.darkDescription": "低亮度深色",
  "settings.codeFont": "代码字体",
  "settings.codeFontDescription": "选择代码块、行内代码及终端输出的等宽显示字体。",
  "settings.codeFont.google-sans-code": "Google Sans Code NF",
  "settings.codeFont.google-sans-codeDescription": "几何无衬线等宽风格，符号与排版精致",
  "settings.codeFont.maple-mono": "Maple Mono NF CN",
  "settings.codeFont.maple-monoDescription": "圆角等宽设计，支持中文对齐与连字",
  "settings.workspace": "工作区",
  "settings.workspaceDescription": "Moros 读取文件和执行任务的默认目录。",
  "settings.workingDirectory": "工作目录",
  "settings.quickPrompts": "快捷项",
  "settings.quickPromptsDescription": "编辑主页输入框上方的 Prompt 快捷项，最多 {max} 条。",
  "settings.quickPromptsCount": "{count}/{max} 条",
  "settings.quickPromptLabel": "快捷项 {index}",
  "settings.quickPromptPlaceholder": "输入点击后放入输入框的 Prompt 内容",
  "settings.addQuickPrompt": "添加快捷项",
  "settings.restoreQuickPromptDefaults": "恢复默认",
  "settings.removeQuickPrompt": "移除快捷项 {index}",
  "settings.quickPromptsHint": "保存后会立即用于主页快捷项。",
  "settings.quickPromptsRequired": "每条快捷项都需要填写内容。",
  "settings.permissionMode": "权限模式",
  "settings.permissionDescription": "决定 Moros 何时需要在执行操作前征求确认。",
  "settings.permission.ask": "请求批准",
  "settings.permission.askDescription": "执行 Shell 命令、外部编辑或动态工具前询问",
  "settings.permission.approve": "自动批准",
  "settings.permission.approveDescription": "自动允许可证明为只读的操作",
  "settings.permission.full": "完全访问",
  "settings.permission.fullDescription": "不受限制地访问互联网和本机文件",
  "settings.runtime": "运行环境",
  "settings.runtimeDescription": "执行本地 Agent 工作所需的运行环境。",
  "settings.runtimeAvailable": "Pi bash 工具已可执行 shell 命令。",
  "settings.runtimeConfigured": "Pi bash 工具正在使用 settings.json 中配置的 shellPath。",
  "settings.runtimeMissing": "Moros 需要 Git Bash 或其他 bash.exe 才能运行 Agent 的 shell 工具。",
  "settings.runtimeRefresh": "刷新检测",
  "settings.runtimeInstall": "打开安装命令",
  "settings.runtimeDownload": "打开下载页",
  "settings.profile": "个人资料",
  "settings.localIdentity": "本地身份",
  "settings.profileIdentity": "个人身份",
  "settings.uploadPhoto": "上传头像",
  "settings.processing": "处理中…",
  "settings.changePhoto": "更换头像",
  "settings.addPhoto": "添加头像",
  "settings.localActivity": "本地活动",
  "settings.localSessions": "本地会话",
  "settings.sessionTokens": "会话 Token",
  "settings.contextUsed": "已用上下文",
  "settings.enabledSkills": "已启用技能",
  "settings.environment": "环境",
  "settings.currentConfiguration": "当前本地配置",
  "settings.activeModel": "当前对话模型",
  "settings.activeModelDescription": "用于进行对话和执行任务的主模型",
  "settings.enabledModels": "启用的模型",
  "settings.enabledModelsDescription": "决定哪些模型会出现在对话框的模型选择器中",
  "settings.thinkingLevelDescription": "决定支持思考的模型在回答时的思考深度",
  "settings.aiConfiguration": "AI 配置",
  "settings.models": "Provider 与模型",
  "settings.modelsDescription": "只有启用的模型会出现在对话框的模型选择器中。",
  "settings.providersKeys": "Provider 与 API Key",
  "settings.connectedCount": "已连接 {count} 个",
  "settings.connectedProvidersList": "已连接的 Provider 列表",
  "settings.enabledCount": "已启用 {count} 个",
  "settings.searchProviders": "搜索 Provider",
  "settings.reconnect": "重新连接",
  "settings.signIn": "登录",
  "settings.replaceKey": "替换 Key",
  "settings.setKey": "设置 Key",
  "settings.showKey": "显示 {name} API Key",
  "settings.hideKey": "隐藏 {name} API Key",
  "settings.copyKey": "复制 {name} API Key",
  "settings.titleModel": "对话标题模型",
  "settings.titleModelDescription": "自动将首次对话概括为简短标题",
  "settings.providerNotConnected": "Provider 未连接",
  "settings.summaryModel": "摘要模型",
  "settings.searchModels": "搜索模型",
  "settings.refreshModels": "刷新 Provider 与模型",
  "settings.noModels": "没有可用模型",
  "settings.noModelsDescription": "配置 Provider 后，可用模型会显示在这里。",
  "settings.context": "{value} 上下文",
  "settings.skillsEyebrow": "Agent 能力",
  "settings.skillsDescription": "自动发现工作区和本机的 Moros、Codex、Claude Code、Cursor、OpenCode 与 .agents Skills。",
  "settings.skillsCompatibility": "直接读取原文件；MCP、Hooks 和其他 harness 专属工具不会自动导入。",
  "settings.skillsRescan": "重新扫描",
  "settings.skillsScanning": "扫描中…",
  "settings.skillsRescanBusy": "任务运行中，请结束后重新扫描。",
  "settings.skillScope.project": "项目",
  "settings.skillScope.user": "用户",
  "settings.skillScope.custom": "自定义目录",
  "settings.skillManualOnly": "仅手动调用",
  "settings.addDirectory": "添加目录",
  "settings.noSkills": "没有找到技能",
  "settings.additionalDirectories": "额外目录",
  "settings.skillsSearch": "搜索技能",
  "settings.clearSkillsSearch": "清除技能搜索",
  "settings.installedSkills": "已安装",
  "settings.allSkills": "全部",
  "settings.disabledSkills": "已停用技能",
  "settings.availableSkills": "可用技能",
  "settings.skillEnabled": "已启用",
  "settings.skillDisabled": "已停用",
  "settings.skillToggle": "切换技能 {name}",
  "settings.skillsFilter": "筛选技能",
  "settings.dependenciesEyebrow": "系统就绪度",
  "settings.dependenciesDescription": "检查 Moros 运行所需的 Git 与 Bash。只有在你确认后才会启动安装。",
  "settings.dependenciesRefresh": "重新检测",
  "settings.dependenciesRefreshing": "正在检测…",
  "settings.dependenciesReady": "{ready}/{total} 项已就绪",
  "settings.dependenciesRequiredReady": "Moros 核心运行环境已就绪",
  "settings.dependenciesRequiredMissing": "仍有 Moros 核心依赖未安装",
  "settings.dependenciesChecked": "最近检测：{time}",
  "settings.dependenciesCategory.runtime": "Moros 运行环境",
  "settings.dependenciesCategory.runtimeDescription": "执行本地 Agent 命令所需的基础工具。",




  "settings.dependency.git.name": "Git",
  "settings.dependency.git.description": "提供版本控制能力，也是 Windows 上安装 Git Bash 的推荐方式。",
  "settings.dependency.bash.name": "Bash / Git Bash",
  "settings.dependency.bash.description": "Moros 本地 Agent 执行 Shell 命令所需的命令环境。",








  "settings.dependency.installed": "已安装",
  "settings.dependency.missing": "未检测到",
  "settings.dependency.unsupported": "当前系统不支持",
  "settings.dependency.required": "Moros 必需",
  "settings.dependency.optional": "按需安装",
  "settings.dependency.version": "版本 {version}",
  "settings.dependency.recommended": "提供版本 {version}",
  "settings.dependency.install": "下载并安装",
  "settings.dependency.reinstall": "重新安装",
  "settings.dependency.openLocation": "打开位置",
  "settings.dependency.officialSource": "官方来源",
  "settings.dependency.confirmInstall": "将从固定来源下载，并在完成后启动 Windows 安装程序。",
  "settings.dependency.confirm": "确认安装",
  "settings.dependency.externalAction": "前往官方下载",
  "settings.dependency.externalConfirm": "将打开供应商官方页面；下载与安装需在浏览器中完成。",
  "settings.dependency.externalConfirmAction": "打开官方页面",
  "settings.dependency.externalLaunching": "正在打开官方页面…",
  "settings.dependency.externalAwaitingUser": "官方页面已打开，请在浏览器中继续",
  "settings.dependency.cancelDownload": "取消下载",
  "settings.dependency.phase.queued": "正在准备下载…",
  "settings.dependency.phase.downloading": "正在下载",
  "settings.dependency.phase.extracting": "下载完成，正在解压…",
  "settings.dependency.phase.installing": "正在通过 winget 安装…",
  "settings.dependency.phase.launching": "正在启动安装程序…",
  "settings.dependency.phase.awaitingUser": "安装程序已打开，请按提示完成安装",
  "settings.dependency.phase.completed": "安装已完成",
  "settings.dependency.phase.failed": "安装失败",
  "settings.dependency.phase.cancelled": "下载已取消",
  "settings.dependency.retry": "重试",
  "settings.dependency.noItems": "依赖项尚未加载",














  "composer.configureModel": "配置模型后即可开始对话。",
  "composer.configureModelAction": "未配置模型，去配置",
  "composer.configureCredentialsAction": "未配置凭据，去配置",
  "composer.steer": "转向",
  "composer.followUp": "追问",
  "composer.dropImages": "释放以附加图片",
  "composer.imageRules": "PNG、JPEG、WebP 或 GIF · 单张不超过 10 MB",
  "composer.skillCommands": "技能命令",
  "composer.selectedSkill": "已选择技能",
  "composer.removeSkill": "移除技能 {name}",
  "composer.placeholder": "描述任务、粘贴错误信息，或让 Moros 修改代码",
  "composer.steerPlaceholder": "输入一条转向指令…",
  "composer.voiceStart": "准备语音输入",
  "composer.voiceListening": "正在倾听",
  "composer.voiceProcessing": "正在识别",
  "composer.voiceReady": "语音输入已就绪",
  "composer.startDesktopVoice": "启动 Windows 语音输入",
  "composer.startBrowserVoice": "启动浏览器语音输入",
  "composer.stop": "停止",
  "composer.send": "发送",
  "composer.configureFirst": "请先配置模型",
  "composer.moreActions": "更多操作",
  "composer.addImage": "添加图片",
  "composer.newConversation": "新对话",
  "composer.changeWorkspace": "更换工作区",
  "composer.selectModel": "选择模型",
  "composer.addModelInSettings": "请在设置中添加模型。",
  "composer.model": "模型",
  "composer.select": "选择",
  "composer.chooseWorkspace": "选择工作区",
  "composer.estimatedBreakdown": "估算明细",
  "composer.viewReport": "查看报告",
  "composer.closeContext": "关闭上下文用量",
  "composer.contextUsage": "上下文用量",
  "composer.contextUsedPercent": "上下文已使用 {percent}%",
  "composer.contextUnknown": "上下文用量未知",
  "composer.contextFull": "{percent}% 已使用",
  "composer.contextNoPercent": "— 已使用",
  "composer.tokens": "Token",
  "composer.contextFixed": "固定上下文",
  "composer.contextRuntime": "运行上下文",
  "composer.contextViewDetails": "查看 {label} 细则",
  "composer.contextCategoryDetails": "{label} 细则",
  "composer.contextBackOverview": "返回总览",
  "composer.segment.systemPrompt": "System Prompt",
  "composer.segment.toolDefinitions": "工具定义",
  "composer.segment.rules": "规则",
  "composer.segment.skills": "技能",
  "composer.segment.mcpTools": "MCP 与动态工具",
  "composer.segment.subagents": "子 Agent 定义",
  "composer.segment.conversation": "对话",
  "composer.segment.read": "Read",
  "composer.segment.write": "Write",
  "composer.segment.edit": "Edit",
  "composer.segment.bash": "Bash",
  "composer.segment.otherTools": "其他工具",
  "composer.effort": "思考深度",
  "composer.light": "轻量",
  "composer.medium": "中等",
  "composer.high": "高",
  "composer.extraHigh": "极高",
  "composer.max": "最大",
  "composer.addModel": "添加模型",
  "composer.imageOnly": "仅支持 PNG、JPEG、WebP 与 GIF 图片。",
  "composer.imageTooLarge": "单张图片不能超过 10 MB。",
  "composer.imageReadFailed": "无法读取图片：{name}",
  "composer.imageInvalid": "图片数据无效。",
  "composer.selectImageFile": "请选择图片文件。",
  "composer.maxImages": "一次最多附加 8 张图片。",
  "composer.imageUnsupported": "当前模型不支持图像输入，请先切换到支持视觉的模型。",
  "composer.voiceOpening": "正在打开 Windows 语音输入…",
  "composer.micConnecting": "正在连接麦克风…",
  "composer.voiceProcessingPreview": "正在处理语音…",
  "composer.voiceStartFailed": "无法启动语音输入",
  "composer.voiceOpened": "Windows 语音输入已打开",
  "composer.voiceRecognized": "语音已识别",
  "composer.attachment": "附件 {number}",
  "composer.removeImage": "移除图片 {number}",
  "composer.queueRecall": "撤回并放回输入框",
  "composer.queueWithdraw": "撤回排队消息",
  "thread.aborted": "已中止",
  "thread.copyReply": "复制回复",
  "thread.editPrompt": "重新编辑",
  "thread.retry": "重试",
  "thread.running": "执行中",
  "thread.failed": "失败",
  "thread.complete": "完成",
  "thread.waitingOutput": "等待输出…",
  "thread.copyToolOutput": "复制工具输出",
  "thread.collapseToolOutput": "折叠工具输出",
  "thread.jumpLatest": "跳到最新消息",
  "thread.deny": "拒绝",
  "thread.denying": "正在拒绝…",
  "thread.allowOnce": "允许一次",
  "thread.allowSession": "本次会话始终允许",
  "thread.allowing": "正在允许…",
  "thread.commandApproval": "命令批准",
  "thread.actionApproval": "操作审批",
  "thread.commandExplanationUnavailable": "标题总结模型暂时无法生成这条命令的说明。",
  "thread.thinking": "思考过程",
  "thread.summary.thought": "思考了 {count} 次",
  "thread.summary.thoughtPlural": "思考了 {count} 次",
  "thread.summary.explored": "探索了 {count} 个文件",
  "thread.summary.exploredPlural": "探索了 {count} 个文件",
  "thread.summary.commands": "运行了 {count} 条命令",
  "thread.summary.commandsPlural": "运行了 {count} 条命令",
  "thread.activityStatus.working": "Agent 正在处理",
  "thread.activityStatus.searching": "Agent 正在搜索",
  "thread.activityStatus.solving": "Agent 正在推理",
  "thread.activity.command.active": "正在运行命令",
  "thread.activity.command.complete": "已运行命令",
  "thread.activity.command.itemActive": "运行中",
  "thread.activity.command.itemComplete": "已运行",
  "thread.activity.read.active": "正在读取文件",
  "thread.activity.read.complete": "已读取文件",
  "thread.activity.read.itemActive": "读取中",
  "thread.activity.read.itemComplete": "已读取",
  "thread.activity.write.active": "正在写入文件",
  "thread.activity.write.complete": "已写入文件",
  "thread.activity.write.itemActive": "写入中",
  "thread.activity.write.itemComplete": "已写入",
  "thread.activity.edit.active": "正在编辑文件",
  "thread.activity.edit.complete": "已编辑文件",
  "thread.activity.edit.itemActive": "编辑中",
  "thread.activity.edit.itemComplete": "已编辑",
  "thread.activity.search.active": "正在搜索文件",
  "thread.activity.search.complete": "已搜索文件",
  "thread.activity.search.itemActive": "搜索中",
  "thread.activity.search.itemComplete": "已搜索",
  "thread.archive": "归档",
  "thread.delete": "删除",
  "thread.confirmAction": "确认{action}会话",
  "thread.autoAction": "{seconds} 秒后自动{action}",
  "thread.doingAction": "正在{action}",
  "thread.processing": "正在处理…",
  "thread.undo": "撤销",
  "thread.copyCode": "复制代码",
  "thread.lines": "{count} 行",







  "search.dialog": "搜索对话",
  "search.clear": "清空搜索",
  "search.results": "搜索结果",
  "search.recent": "最近对话",
  "search.noMatches": "没有匹配的对话",
  "search.searching": "正在搜索会话内容…",



























  "context.title": "当前会话上下文",
  "context.developer": "开发者",
  "context.refresh": "刷新上下文",
  "context.close": "关闭上下文查看器",
  "context.session": "会话",

  "context.context": "上下文",
  "context.usage": "占用",
  "context.notCreated": "尚未创建",

  "context.noUsage": "尚无用量数据",


  "context.systemPrompt": "有效 System Prompt",
  "context.messages": "消息 ({count})",
  "context.loading": "正在读取上下文…",
  "context.copyCurrent": "复制当前内容",
  "hero.prompt1": "阅读当前代码库，概括架构和主要入口",
  "hero.prompt2": "找出最值得简化的模块，并给出最小改动方案",
  "hero.prompt3": "运行相关测试，定位第一个真实失败并修复根因",
















































  "thread.activity.exploring": "Exploring",
  "settings.profileName": "姓名",
  "settings.profileNamePlaceholder": "输入显示名称",
  "settings.profileHandle": "用户名",
  "settings.profileHandlePlaceholder": "@用户名",
  "settings.profileAvatarAlt": "个人资料头像",
  "settings.searchNoResults": "未找到匹配的设置项",
  "settings.copyWorkspacePath": "复制路径",
  "settings.expandWorkspacePath": "展开完整路径",
  "settings.collapseWorkspacePath": "收起完整路径",
  "settings.quickPromptsScrollHint": "滚轮切换",
  "settings.quickPromptsPosition": "快捷项 {current}/{total}",
  "settings.nav.archive": "归档箱",
  "settings.nav.archiveDescription": "查看并恢复已归档的会话",
  "settings.archiveEyebrow": "会话归档",
  "settings.archiveDescription": "查看当前工作区已归档的会话，并可随时将它们恢复到会话列表。",
  "settings.archiveRefresh": "刷新归档列表",
  "settings.archiveRestore": "恢复",
  "settings.archiveRestoreLabel": "恢复会话 {name}",
  "settings.archiveEmpty": "还没有已归档的会话",
  "settings.quickPromptsNext": "下一条提示",
  "settings.quickPromptsUnsavedTitle": "未保存的快速提示词",
  "settings.quickPromptsUnsavedBody": "快捷项还有尚未保存的更改，离开前要保存吗？",
  "settings.quickPromptsUnsavedSave": "保存并离开",
  "settings.quickPromptsUnsavedDiscard": "放弃更改",
  "settings.quickPromptsUnsavedStay": "继续编辑",
  "settings.about": "关于",
  "settings.aboutDescription": "当前安装的 Moros 应用版本。",
  "settings.aboutVersion": "版本 {version}",
  "workspace.changeConfirmTitle": "更换工作区？",
  "workspace.changeConfirmBody": "当前任务仍在运行。更换工作区会中止本次任务，是否继续？",
  "workspace.changeConfirmConfirm": "继续",
} as const;

export type TranslationKey = keyof typeof zhCN;
type Dictionary = Record<TranslationKey, string>;

const zhTW = {
  "common.back": "返回", "common.cancel": "取消", "common.close": "關閉", "common.change": "更改",
  "common.save": "儲存", "common.saving": "正在儲存…", "common.remove": "移除", "common.add": "新增",
  "common.open": "開啟", "common.insert": "插入", "common.refresh": "重新整理", "common.copy": "複製",
  "common.copied": "已複製", "common.copyFailed": "複製失敗", "common.active": "使用中", "common.use": "使用",
  "common.connected": "已連線", "common.notConfigured": "未設定", "common.notSelected": "未選擇", "common.notSet": "未設定",
  "common.ready": "已就緒", "common.required": "必要", "common.working": "處理中…", "common.search": "搜尋",
  "common.unknown": "未知", "common.today": "今天", "common.yesterday": "昨天", "common.now": "剛剛", "common.untitledSession": "未命名對話",
  "common.done": "完成",
  "common.viewImage": "檢視大圖", "common.closeImagePreview": "關閉預覽",
  "language.label": "語言", "language.description": "選擇 Moros 介面的顯示語言。",
  "language.zh-CN": "简体中文", "language.zh-TW": "繁體中文",
  "titlebar.navigation": "導覽控制", "titlebar.collapseSidebar": "摺疊側邊欄", "titlebar.expandSidebar": "展開側邊欄",
  "titlebar.back": "上一頁", "titlebar.forward": "下一頁", "titlebar.globalMenu": "全域選單",
  "titlebar.file": "檔案", "titlebar.edit": "編輯", "titlebar.view": "檢視", "titlebar.help": "說明",
  "titlebar.newConversation": "新增對話", "titlebar.openWorkspace": "開啟工作區", "titlebar.settings": "設定",
  "titlebar.exit": "結束", "titlebar.focusComposer": "聚焦輸入框", "titlebar.searchConversations": "搜尋對話",
  "titlebar.developerContext": "開發人員：目前的上下文", "titlebar.providersModels": "Provider 與模型",
  "titlebar.skills": "技能", "titlebar.about": "關於 Moros", "titlebar.profile": "個人資料",
  "titlebar.minimize": "最小化", "titlebar.maximize": "最大化",
  "settings.search": "搜尋設定", "settings.navigation": "設定導覽",
  "settings.nav.general": "一般", "settings.nav.generalDescription": "語言、快捷項與執行環境",
  "settings.nav.profile": "個人資料", "settings.nav.profileDescription": "身分與本機活動",
  "settings.nav.models": "Provider 與模型", "settings.nav.modelsDescription": "Provider 存取與模型選擇",
  "settings.nav.skills": "技能", "settings.nav.skillsDescription": "Agent 能力",
  "settings.general": "一般", "settings.generalDescription": "管理語言、快捷項與本機 Agent 執行環境。",
  "settings.commandExplanationLanguage": "Command 說明語言",
  "settings.commandExplanationLanguageDescription": "選擇對話標題模型產生 Command 說明時使用的語言。",
  "settings.commandExplanationLanguageAuto": "跟隨介面語言",
  "settings.composerSendKey": "傳送方式",
  "settings.composerSendKeyDescription": "選擇輸入框中傳送訊息與換行使用的按鍵。",
  "settings.composerSendKeyEnter": "Enter 傳送，Shift+Enter 換行",
  "settings.composerSendKeyShiftEnter": "Shift+Enter 傳送，Enter 換行",
  "settings.appearance": "外觀", "settings.appearanceDescription": "選擇高對比淺色、深色，或自動跟隨系統。",
  "settings.colorTheme": "色彩主題", "settings.theme.system": "系統", "settings.theme.systemDescription": "跟隨作業系統",
  "settings.theme.light": "淺色", "settings.theme.lightDescription": "高對比淺色", "settings.theme.dark": "深色",
  "settings.theme.darkDescription": "低亮度深色",
  "settings.codeFont": "程式碼字型",
  "settings.codeFontDescription": "選擇程式碼區塊、行內程式碼及終端輸出的等寬顯示字型。",
  "settings.codeFont.google-sans-code": "Google Sans Code NF",
  "settings.codeFont.google-sans-codeDescription": "幾何無襯線等寬風格，符號與排版精緻",
  "settings.codeFont.maple-mono": "Maple Mono NF CN",
  "settings.codeFont.maple-monoDescription": "圓角等寬設計，支援中文對齊與連字",
  "settings.workspace": "工作區",
  "settings.workspaceDescription": "Moros 讀取檔案和執行工作的預設目錄。", "settings.workingDirectory": "工作目錄",
  "settings.quickPrompts": "快捷項", "settings.quickPromptsDescription": "編輯首頁輸入框上方的 Prompt 快捷項，最多 {max} 條。",
  "settings.quickPromptsCount": "{count}/{max} 條", "settings.quickPromptLabel": "快捷項 {index}",
  "settings.quickPromptPlaceholder": "輸入點擊後放入輸入框的 Prompt 內容", "settings.addQuickPrompt": "新增快捷項",
  "settings.restoreQuickPromptDefaults": "還原預設值",
  "settings.removeQuickPrompt": "移除快捷項 {index}", "settings.quickPromptsHint": "儲存後會立即套用到首頁快捷項。",
  "settings.quickPromptsRequired": "每條快捷項都需要填寫內容。",
  "settings.permissionMode": "權限模式", "settings.permissionDescription": "決定 Moros 何時需要在執行操作前徵求確認。",
  "settings.permission.ask": "要求核准", "settings.permission.askDescription": "執行 Shell 指令、外部編輯或動態工具前先詢問",
  "settings.permission.approve": "自動核准", "settings.permission.approveDescription": "自動允許確認為唯讀的操作",
  "settings.permission.full": "完整存取", "settings.permission.fullDescription": "不受限制地存取網際網路和本機檔案",
  "settings.runtime": "執行環境", "settings.runtimeDescription": "執行本機 Agent 工作所需的環境。",
  "settings.runtimeAvailable": "Pi bash 工具已可執行 shell 指令。", "settings.runtimeConfigured": "Pi bash 工具正在使用 settings.json 中設定的 shellPath。",
  "settings.runtimeMissing": "Moros 需要 Git Bash 或其他 bash.exe 才能執行 Agent 的 shell 工具。",
  "settings.runtimeRefresh": "重新檢查", "settings.runtimeInstall": "開啟安裝指令", "settings.runtimeDownload": "開啟下載頁面",











  "sidebar.new": "新增", "sidebar.search": "搜尋", "sidebar.skills": "技能", "sidebar.sessions": "對話",


   "sidebar.confirmRename": "確認重新命名", "sidebar.cancelRename": "取消重新命名",
  "sidebar.moreActions": "更多操作", "sidebar.openProfile": "開啟個人資料",
  "sidebar.noConversations": "尚無對話", "sidebar.legacyWorkspace": "舊版對話", "sidebar.sessionRunning": "對話正在執行", "sidebar.openRunningBeforeRemove": "請先進入正在執行的對話，再封存或刪除", "sidebar.showMore": "顯示更多", "sidebar.showLess": "收合", "sidebar.empty": "開始第一次對話後，對話會顯示在這裡。",
  "sidebar.contextUsage": "上下文用量", "sidebar.openWorkspace": "開啟工作區", "sidebar.skillLibrary": "技能庫",
  "sidebar.settings": "設定", "sidebar.rename": "重新命名",
  "sidebar.archive": "封存", "sidebar.delete": "刪除", "sidebar.copySessionId": "複製 Session ID",
  "sidebar.currentWorkspace": "目前",
  "sidebar.newInWorkspace": "在此工作區新增對話",
  "sidebar.pinWorkspace": "置頂工作區", "sidebar.unpinWorkspace": "取消置頂",
  "sidebar.copyWorkspacePath": "複製完整路徑", "sidebar.revealInExplorer": "在檔案總管中開啟",
  "sidebar.collapseWorkspace": "折疊工作區", "sidebar.expandWorkspace": "展開工作區",
  "sidebar.customizeWorkspace": "自訂圖示與顏色",

  "sidebar.resize": "調整側邊欄寬度", "sidebar.renameEmpty": "對話名稱不可為空。", "sidebar.copyIdFailed": "複製 Session ID 失敗",
  "composer.configureModel": "設定模型後即可開始對話。", "composer.configureModelAction": "尚未設定模型，前往設定",
  "composer.configureCredentialsAction": "尚未設定憑證，前往設定",
  "composer.startDesktopVoice": "啟動 Windows 語音輸入", "composer.startBrowserVoice": "啟動瀏覽器語音輸入",
  "composer.send": "傳送", "composer.selectModel": "選擇模型", "composer.chooseWorkspace": "選擇工作區",
  "composer.contextUsedPercent": "上下文已使用 {percent}%", "composer.contextUnknown": "上下文用量未知",
  "composer.contextFixed": "固定上下文", "composer.contextRuntime": "執行上下文",
  "composer.contextViewDetails": "檢視 {label} 明細", "composer.contextCategoryDetails": "{label} 明細",
  "composer.contextBackOverview": "回到總覽",
  "composer.extraHigh": "極高", "composer.selectImageFile": "請選擇圖片檔案。",
  "composer.placeholder": "描述工作、貼上錯誤訊息，或讓 Moros 修改程式碼", "composer.steerPlaceholder": "輸入轉向指令…",
  "thread.copyReply": "複製回覆", "thread.running": "執行中", "thread.failed": "失敗", "thread.complete": "完成",
  "thread.jumpLatest": "跳到最新訊息", "thread.thinking": "思考過程",
  "thread.summary.thought": "思考了 {count} 次",
  "thread.summary.thoughtPlural": "思考了 {count} 次",
  "thread.summary.explored": "探索了 {count} 個檔案",
  "thread.summary.exploredPlural": "探索了 {count} 個檔案",
  "thread.summary.commands": "執行了 {count} 條指令",
  "thread.summary.commandsPlural": "執行了 {count} 條指令",
  "thread.activityStatus.working": "Agent 正在處理", "thread.activityStatus.searching": "Agent 正在搜尋",
  "thread.activityStatus.solving": "Agent 正在推理",
  "search.dialog": "搜尋對話", "search.results": "搜尋結果", "search.recent": "最近對話", "search.noMatches": "沒有符合的對話",
  "search.searching": "正在搜尋對話內容…",









  "context.title": "目前對話上下文",
    "context.loading": "正在讀取上下文…",
  "hero.prompt1": "閱讀目前程式庫，概述架構與主要入口",
  "hero.prompt2": "找出最值得簡化的模組，並提出最小修改方案",
  "hero.prompt3": "執行相關測試，定位第一個真實失敗並修正根因",
















































  "error.avatarStorage": "無法將頭像儲存到本機。", "error.imageRead": "無法讀取這張圖片。",
  "error.imageType": "請選擇圖片檔案。", "error.imageSize": "頭像圖片不可超過 12 MB。",
  "error.imageDimensions": "圖片尺寸無效。", "error.imageProcessing": "目前環境無法處理頭像圖片。",
  "settings.profileName": "姓名", "settings.profileNamePlaceholder": "輸入顯示名稱",
  "settings.profileHandle": "使用者名稱", "settings.profileHandlePlaceholder": "@使用者名稱",
  "settings.profileAvatarAlt": "個人資料頭像",
  "settings.searchNoResults": "找不到符合的設定項目", "settings.copyWorkspacePath": "複製路徑",
  "settings.expandWorkspacePath": "展開完整路徑", "settings.collapseWorkspacePath": "收合完整路徑",
  "settings.quickPromptsScrollHint": "滾輪切換", "settings.quickPromptsPosition": "快捷項 {current}/{total}",
  "settings.enabledSkills": "已啟用技能", "settings.enabledCount": "已啟用 {count} 個",
  "settings.skillsSearch": "搜尋技能", "settings.clearSkillsSearch": "清除技能搜尋",
  "settings.installedSkills": "已安裝", "settings.allSkills": "全部", "settings.disabledSkills": "已停用技能",
  "settings.availableSkills": "可用技能", "settings.skillEnabled": "已啟用", "settings.skillDisabled": "已停用",
  "settings.skillToggle": "切換技能 {name}", "settings.skillsFilter": "篩選技能",
  "common.loading": "載入中…",
  "language.en": "English",
  "language.de": "Deutsch",
  "settings.category.personal": "個人設定",
  "settings.category.system": "系統與資源",
  "settings.category.ai": "AI 設定",
  "settings.nav.dependencies": "相依項目",
  "settings.nav.dependenciesDescription": "執行環境與命令列工具",
  "settings.preferences": "Moros 偏好設定",
  "settings.profile": "個人資料",
  "settings.localIdentity": "本機身分",
  "settings.profileIdentity": "個人身分",
  "settings.uploadPhoto": "上傳大頭貼",
  "settings.processing": "處理中…",
  "settings.changePhoto": "更換大頭貼",
  "settings.addPhoto": "新增大頭貼",
  "settings.localActivity": "本機活動",
  "settings.localSessions": "本機對話",
  "settings.sessionTokens": "對話 Token",
  "settings.contextUsed": "已使用的上下文",
  "settings.environment": "環境",
  "settings.currentConfiguration": "目前的本機設定",
  "settings.activeModel": "目前的對話模型",
  "settings.activeModelDescription": "用於對話及執行工作的主要模型",
  "settings.enabledModels": "已啟用的模型",
  "settings.enabledModelsDescription": "決定要在對話模型選擇器中顯示哪些模型",
  "settings.thinkingLevelDescription": "決定支援思考功能的模型在回答時的思考深度",
  "settings.aiConfiguration": "AI 設定",
  "settings.models": "Provider 與模型",
  "settings.modelsDescription": "只有已啟用的模型會顯示在對話模型選擇器中。",
  "settings.providersKeys": "Provider 與 API Key",
  "settings.connectedCount": "已連線 {count} 個",
  "settings.connectedProvidersList": "已連線的 Provider 清單",
  "settings.searchProviders": "搜尋 Provider",
  "settings.reconnect": "重新連線",
  "settings.signIn": "登入",
  "settings.replaceKey": "更換 Key",
  "settings.setKey": "設定 Key",
  "settings.showKey": "顯示 {name} API Key",
  "settings.hideKey": "隱藏 {name} API Key",
  "settings.copyKey": "複製 {name} API Key",
  "settings.titleModel": "對話標題模型",
  "settings.titleModelDescription": "自動將首次對話摘要為簡短標題",
  "settings.providerNotConnected": "Provider 未連線",
  "settings.summaryModel": "摘要模型",
  "settings.searchModels": "搜尋模型",
  "settings.refreshModels": "重新整理 Provider 與模型",
  "settings.noModels": "沒有可用的模型",
  "settings.noModelsDescription": "設定 Provider 後，可用的模型會顯示於此。",
  "settings.context": "{value} 上下文",
  "settings.skillsEyebrow": "Agent 功能",
  "settings.skillsDescription": "自動探索工作區和本機的 Moros、Codex、Claude Code、Cursor、OpenCode 與 .agents Skills。",
  "settings.skillsCompatibility": "直接讀取原始檔案；MCP、Hooks 和其他 harness 專屬工具不會自動匯入。",
  "settings.skillsRescan": "重新掃描",
  "settings.skillsScanning": "掃描中…",
  "settings.skillsRescanBusy": "工作執行中，請結束後重新掃描。",
  "settings.skillScope.project": "專案",
  "settings.skillScope.user": "使用者",
  "settings.skillScope.custom": "自訂目錄",
  "settings.skillManualOnly": "僅手動呼叫",
  "settings.addDirectory": "新增目錄",
  "settings.noSkills": "找不到技能",
  "settings.additionalDirectories": "其他目錄",
  "settings.dependenciesEyebrow": "系統就緒狀態",
  "settings.dependenciesDescription": "檢查 Moros 執行所需的 Git 與 Bash。只有在你確認後才會啟動安裝。",
  "settings.dependenciesRefresh": "重新偵測",
  "settings.dependenciesRefreshing": "正在偵測…",
  "settings.dependenciesReady": "{ready}/{total} 項已就緒",
  "settings.dependenciesRequiredReady": "Moros 核心執行環境已就緒",
  "settings.dependenciesRequiredMissing": "仍有 Moros 核心相依套件尚未安裝",
  "settings.dependenciesChecked": "最近偵測：{time}",
  "settings.dependenciesCategory.runtime": "Moros 執行環境",
  "settings.dependenciesCategory.runtimeDescription": "執行本機 Agent 指令所需的基本工具。",




  "settings.dependency.git.name": "Git",
  "settings.dependency.git.description": "提供版本控制功能，也是在 Windows 上安裝 Git Bash 的建議方式。",
  "settings.dependency.bash.name": "Bash / Git Bash",
  "settings.dependency.bash.description": "Moros 本機 Agent 執行 Shell 指令所需的命令列環境。",








  "settings.dependency.installed": "已安裝",
  "settings.dependency.missing": "未偵測到",
  "settings.dependency.unsupported": "目前的系統不支援",
  "settings.dependency.required": "Moros 必要",
  "settings.dependency.optional": "需要時安裝",
  "settings.dependency.version": "版本 {version}",
  "settings.dependency.recommended": "提供版本 {version}",
  "settings.dependency.install": "下載並安裝",
  "settings.dependency.reinstall": "重新安裝",
  "settings.dependency.openLocation": "開啟位置",
  "settings.dependency.officialSource": "官方來源",
  "settings.dependency.confirmInstall": "將從固定來源下載，完成後會啟動 Windows 安裝程式。",
  "settings.dependency.confirm": "確認安裝",
  "settings.dependency.externalAction": "前往官方下載",
  "settings.dependency.externalConfirm": "將開啟供應商官方頁面；下載與安裝需在瀏覽器中完成。",
  "settings.dependency.externalConfirmAction": "開啟官方頁面",
  "settings.dependency.externalLaunching": "正在開啟官方頁面…",
  "settings.dependency.externalAwaitingUser": "官方頁面已開啟，請在瀏覽器中繼續",
  "settings.dependency.cancelDownload": "取消下載",
  "settings.dependency.phase.queued": "正在準備下載…",
  "settings.dependency.phase.downloading": "正在下載",
  "settings.dependency.phase.extracting": "下載完成，正在解壓縮…",
  "settings.dependency.phase.installing": "正在透過 winget 安裝…",
  "settings.dependency.phase.launching": "正在啟動安裝程式…",
  "settings.dependency.phase.awaitingUser": "安裝程式已開啟，請依照提示完成安裝",
  "settings.dependency.phase.completed": "安裝完成",
  "settings.dependency.phase.failed": "安裝失敗",
  "settings.dependency.phase.cancelled": "已取消下載",
  "settings.dependency.retry": "再試一次",
  "settings.dependency.noItems": "尚未載入相依項目",
  "composer.steer": "轉向",
  "composer.followUp": "追問",
  "composer.dropImages": "放開以附加圖片",
  "composer.imageRules": "PNG、JPEG、WebP 或 GIF · 每張不超過 10 MB",
  "composer.skillCommands": "技能指令",
  "composer.selectedSkill": "已選擇技能",
  "composer.removeSkill": "移除技能 {name}",
  "composer.voiceStart": "準備語音輸入",
  "composer.voiceListening": "正在聆聽",
  "composer.voiceProcessing": "正在辨識",
  "composer.voiceReady": "語音輸入已就緒",
  "composer.stop": "停止",
  "composer.configureFirst": "請先設定模型",
  "composer.moreActions": "更多操作",
  "composer.addImage": "新增圖片",
  "composer.newConversation": "新對話",
  "composer.changeWorkspace": "更換工作區",
  "composer.addModelInSettings": "請在設定中新增模型。",
  "composer.model": "模型",
  "composer.select": "選擇",
  "composer.estimatedBreakdown": "預估明細",
  "composer.viewReport": "檢視報告",
  "composer.closeContext": "關閉上下文用量",
  "composer.contextUsage": "上下文用量",
  "composer.contextFull": "{percent}% 已使用",
  "composer.contextNoPercent": "— 已使用",
  "composer.tokens": "Token",
  "composer.segment.systemPrompt": "System Prompt",
  "composer.segment.toolDefinitions": "工具定義",
  "composer.segment.rules": "規則",
  "composer.segment.skills": "技能",
  "composer.segment.mcpTools": "MCP 與動態工具",
  "composer.segment.subagents": "子 Agent 定義",
  "composer.segment.conversation": "對話",
  "composer.segment.read": "Read",
  "composer.segment.write": "Write",
  "composer.segment.edit": "Edit",
  "composer.segment.bash": "Bash",
  "composer.segment.otherTools": "其他工具",
  "composer.effort": "思考深度",
  "composer.light": "輕量",
  "composer.medium": "中等",
  "composer.high": "高",
  "composer.max": "最大",
  "composer.addModel": "新增模型",
  "composer.imageOnly": "僅支援 PNG、JPEG、WebP 與 GIF 圖片。",
  "composer.imageTooLarge": "每張圖片不得超過 10 MB。",
  "composer.imageReadFailed": "無法讀取圖片：{name}",
  "composer.imageInvalid": "圖片資料無效。",
  "composer.maxImages": "一次最多可附加 8 張圖片。",
  "composer.imageUnsupported": "目前的模型不支援圖片輸入，請先切換至支援視覺功能的模型。",
  "composer.voiceOpening": "正在開啟 Windows 語音輸入…",
  "composer.micConnecting": "正在連接麥克風…",
  "composer.voiceProcessingPreview": "正在處理語音…",
  "composer.voiceStartFailed": "無法啟動語音輸入",
  "composer.voiceOpened": "Windows 語音輸入已開啟",
  "composer.voiceRecognized": "已辨識語音",
  "composer.attachment": "附件 {number}",
  "composer.removeImage": "移除圖片 {number}",
  "composer.queueRecall": "撤回並放回輸入框",
  "composer.queueWithdraw": "撤回排隊訊息",
  "thread.aborted": "已中止",
  "thread.editPrompt": "重新編輯",
  "thread.retry": "重試",
  "thread.waitingOutput": "正在等待輸出…",
  "thread.copyToolOutput": "複製工具輸出",
  "thread.collapseToolOutput": "折疊工具輸出",
  "thread.deny": "拒絕",
  "thread.denying": "正在拒絕…",
  "thread.allowOnce": "允許一次",
  "thread.allowSession": "本次對話一律允許",
  "thread.allowing": "正在允許…",
  "thread.commandApproval": "指令核准",
  "thread.actionApproval": "操作核准",
  "thread.commandExplanationUnavailable": "對話標題模型目前無法產生這個指令的說明。",
  "thread.activity.command.active": "正在執行指令",
  "thread.activity.command.complete": "已執行指令",
  "thread.activity.command.itemActive": "執行中",
  "thread.activity.command.itemComplete": "已執行",
  "thread.activity.read.active": "正在讀取檔案",
  "thread.activity.read.complete": "已讀取檔案",
  "thread.activity.read.itemActive": "讀取中",
  "thread.activity.read.itemComplete": "已讀取",
  "thread.activity.write.active": "正在寫入檔案",
  "thread.activity.write.complete": "已寫入檔案",
  "thread.activity.write.itemActive": "寫入中",
  "thread.activity.write.itemComplete": "已寫入",
  "thread.activity.edit.active": "正在編輯檔案",
  "thread.activity.edit.complete": "已編輯檔案",
  "thread.activity.edit.itemActive": "編輯中",
  "thread.activity.edit.itemComplete": "已編輯",
  "thread.activity.search.active": "正在搜尋檔案",
  "thread.activity.search.complete": "已搜尋檔案",
  "thread.activity.search.itemActive": "搜尋中",
  "thread.activity.search.itemComplete": "已搜尋",
  "thread.archive": "封存",
  "thread.delete": "刪除",
  "thread.confirmAction": "確認{action}對話",
  "thread.autoAction": "{seconds} 秒後自動{action}",
  "thread.doingAction": "正在{action}",
  "thread.processing": "處理中…",
  "thread.undo": "復原",
  "thread.copyCode": "複製程式碼",
  "thread.lines": "{count} 行",







  "search.clear": "清除搜尋",






  "context.developer": "開發人員",
  "context.refresh": "重新整理上下文",
  "context.close": "關閉上下文檢視器",
  "context.session": "對話",
  "context.context": "上下文",
  "context.usage": "使用量",
  "context.notCreated": "尚未建立",
  "context.noUsage": "尚無用量資料",
  "context.systemPrompt": "有效的 System Prompt",
  "context.messages": "訊息 ({count})",
  "context.copyCurrent": "複製目前內容",
  "thread.activity.exploring": "探索中",
  "settings.nav.archive": "封存匣",
  "settings.nav.archiveDescription": "檢視並還原已封存的對話",
  "settings.archiveEyebrow": "對話封存",
  "settings.archiveDescription": "檢視目前工作區已封存的對話，並可隨時將它們還原到對話清單。",
  "settings.archiveRefresh": "重新整理封存清單",
  "settings.archiveRestore": "還原",
  "settings.archiveRestoreLabel": "還原對話 {name}",
  "settings.archiveEmpty": "尚無已封存的對話",
  "settings.quickPromptsNext": "下一條提示",
  "settings.quickPromptsUnsavedTitle": "未儲存的快速提示詞",
  "settings.quickPromptsUnsavedBody": "快捷項還有尚未儲存的變更，離開前要儲存嗎？",
  "settings.quickPromptsUnsavedSave": "儲存並離開",
  "settings.quickPromptsUnsavedDiscard": "放棄變更",
  "settings.quickPromptsUnsavedStay": "繼續編輯",
  "settings.about": "關於",
  "settings.aboutDescription": "目前安裝的 Moros 應用程式版本。",
  "settings.aboutVersion": "版本 {version}",
  "workspace.changeConfirmTitle": "更換工作區？",
  "workspace.changeConfirmBody": "目前工作仍在執行。變更工作區會中止這項工作，是否繼續？",
  "workspace.changeConfirmConfirm": "繼續",
} satisfies Dictionary;

const en = {
  "thread.activity.exploring": "Exploring",
  "common.back": "Back", "common.cancel": "Cancel", "common.close": "Close", "common.change": "Change",
  "common.save": "Save", "common.saving": "Saving…", "common.remove": "Remove", "common.add": "Add", "common.open": "Open",
  "common.insert": "Insert", "common.refresh": "Refresh", "common.copy": "Copy", "common.copied": "Copied",
  "common.copyFailed": "Copy failed", "common.active": "Active", "common.use": "Use", "common.connected": "Connected",
  "common.notConfigured": "Not configured", "common.notSelected": "Not selected", "common.notSet": "Not set",
  "common.ready": "Ready", "common.required": "Required", "common.working": "Working…", "common.loading": "Loading…", "common.search": "Search",
  "common.unknown": "Unknown", "common.today": "Today", "common.yesterday": "Yesterday", "common.now": "now", "common.untitledSession": "Untitled conversation",
  "common.done": "Done",
  "common.viewImage": "View full image", "common.closeImagePreview": "Close preview",
  "error.avatarStorage": "The avatar could not be saved locally.", "error.imageRead": "This image could not be read.",
  "error.imageType": "Choose an image file.", "error.imageSize": "The avatar image must be 12 MB or smaller.",
  "error.imageDimensions": "The image dimensions are invalid.", "error.imageProcessing": "This environment cannot process the avatar image.",
  "language.label": "Language", "language.description": "Choose the language used by the Moros interface.",
  "language.zh-CN": "简体中文", "language.zh-TW": "繁體中文", "language.en": "English", "language.de": "Deutsch",
  "titlebar.navigation": "Navigation controls", "titlebar.collapseSidebar": "Collapse sidebar", "titlebar.expandSidebar": "Expand sidebar",
  "titlebar.back": "Back", "titlebar.forward": "Forward", "titlebar.globalMenu": "Global menu", "titlebar.file": "File",
  "titlebar.edit": "Edit", "titlebar.view": "View", "titlebar.help": "Help", "titlebar.newConversation": "New conversation",
  "titlebar.openWorkspace": "Open workspace", "titlebar.settings": "Settings", "titlebar.exit": "Exit",
  "titlebar.focusComposer": "Focus composer", "titlebar.searchConversations": "Search conversations",
  "titlebar.developerContext": "Developer: Current Context", "titlebar.providersModels": "Provider & Model",
  "titlebar.skills": "Skills", "titlebar.about": "About Moros", "titlebar.profile": "Profile",
  "titlebar.minimize": "Minimize", "titlebar.maximize": "Maximize",
  "sidebar.new": "New", "sidebar.search": "Search", "sidebar.skills": "Skills", "sidebar.sessions": "Sessions",


  "sidebar.noConversations": "No conversations", "sidebar.legacyWorkspace": "Legacy sessions", "sidebar.sessionRunning": "Conversation is running", "sidebar.openRunningBeforeRemove": "Open the running conversation before archiving or deleting it", "sidebar.showMore": "Show More", "sidebar.showLess": "Show Less", "sidebar.empty": "Sessions appear here after your first conversation.",
  "sidebar.confirmRename": "Confirm rename", "sidebar.cancelRename": "Cancel rename", "sidebar.moreActions": "More actions",
  "sidebar.openProfile": "Open profile", "sidebar.contextUsage": "Context usage", "sidebar.openWorkspace": "Open workspace",
  "sidebar.skillLibrary": "Skill library", "sidebar.settings": "Settings",
  "sidebar.rename": "Rename", "sidebar.archive": "Archive", "sidebar.delete": "Delete", "sidebar.copySessionId": "Copy Session ID",
  "sidebar.currentWorkspace": "Current",
  "sidebar.newInWorkspace": "New conversation in workspace",
  "sidebar.pinWorkspace": "Pin workspace", "sidebar.unpinWorkspace": "Unpin workspace",
  "sidebar.copyWorkspacePath": "Copy full path", "sidebar.revealInExplorer": "Reveal in File Explorer",
  "sidebar.collapseWorkspace": "Collapse workspace", "sidebar.expandWorkspace": "Expand workspace",
  "sidebar.customizeWorkspace": "Change icon and color",

  "sidebar.resize": "Resize sidebar", "sidebar.renameEmpty": "Conversation name cannot be empty.", "sidebar.copyIdFailed": "Could not copy the Session ID",
  "settings.search": "Search settings",
  "settings.category.personal": "Personal",
  "settings.category.system": "System & Resources",
  "settings.category.ai": "AI Configuration",
  "settings.navigation": "Settings navigation", "settings.nav.general": "General",
  "settings.nav.generalDescription": "Language, shortcuts, and runtime", "settings.nav.profile": "Profile",
  "settings.nav.profileDescription": "Identity and local activity", "settings.nav.models": "Provider & Model",
  "settings.nav.modelsDescription": "Provider access and model selection", "settings.nav.skills": "Skills",
  "settings.nav.skillsDescription": "Agent capabilities", "settings.nav.dependencies": "Dependencies",
  "settings.nav.dependenciesDescription": "Runtime and command-line tools", "settings.preferences": "Moros preferences", "settings.general": "General",
  "settings.generalDescription": "Manage language, shortcuts, and local Agent runtime requirements.",
  "settings.commandExplanationLanguage": "Command explanation language",
  "settings.commandExplanationLanguageDescription": "Choose the language the conversation title model uses for command explanations.",
  "settings.commandExplanationLanguageAuto": "Follow interface language",
  "settings.composerSendKey": "Send shortcut",
  "settings.composerSendKeyDescription": "Choose which keys send a message or insert a newline in the composer.",
  "settings.composerSendKeyEnter": "Enter to send, Shift+Enter for a new line",
  "settings.composerSendKeyShiftEnter": "Shift+Enter to send, Enter for a new line",
  "settings.appearance": "Appearance",
  "settings.appearanceDescription": "Choose light, dark, or follow your system.", "settings.colorTheme": "Color theme",
  "settings.theme.system": "System", "settings.theme.systemDescription": "Follow the operating system", "settings.theme.light": "Light",
  "settings.theme.lightDescription": "High-contrast light theme",   "settings.theme.dark": "Dark", "settings.theme.darkDescription": "Low-light dark theme",
  "settings.codeFont": "Code font",
  "settings.codeFontDescription": "Select the monospaced font for code blocks, inline code, and terminal outputs.",
  "settings.codeFont.google-sans-code": "Google Sans Code NF",
  "settings.codeFont.google-sans-codeDescription": "Geometric monospaced style with refined developer glyphs",
  "settings.codeFont.maple-mono": "Maple Mono NF CN",
  "settings.codeFont.maple-monoDescription": "Rounded monospace design with CJK alignment and ligatures",
  "settings.workspace": "Workspace", "settings.workspaceDescription": "The default folder Moros uses to read files and run tasks.",
  "settings.workingDirectory": "Working directory", "settings.permissionMode": "Permission mode",
  "settings.quickPrompts": "Quick prompts", "settings.quickPromptsDescription": "Edit the prompt shortcuts shown above the home composer, up to {max} items.",
  "settings.quickPromptsCount": "{count}/{max} items", "settings.quickPromptLabel": "Quick prompt {index}",
  "settings.quickPromptPlaceholder": "Enter the prompt inserted into the composer when clicked", "settings.addQuickPrompt": "Add quick prompt",
  "settings.restoreQuickPromptDefaults": "Restore defaults",
  "settings.removeQuickPrompt": "Remove quick prompt {index}", "settings.quickPromptsHint": "Saved changes appear on the home screen immediately.",
  "settings.quickPromptsRequired": "Every quick prompt needs content.",
  "settings.permissionDescription": "Choose when Moros asks before performing an action.", "settings.permission.ask": "Ask for approval",
  "settings.permission.askDescription": "Ask before shell commands, external edits, or dynamic tools", "settings.permission.approve": "Approve for me",
  "settings.permission.approveDescription": "Automatically allow actions that are provably read-only", "settings.permission.full": "Full access",
  "settings.permission.fullDescription": "Unrestricted access to the internet and files on your computer", "settings.runtime": "Runtime",
  "settings.runtimeDescription": "Runtime requirements for local Agent work.", "settings.profile": "Profile", "settings.localIdentity": "Local identity",
  "settings.runtimeAvailable": "The Pi bash tool is ready to run shell commands.", "settings.runtimeConfigured": "The Pi bash tool is using the shellPath configured in settings.json.",
  "settings.runtimeMissing": "Moros needs Git Bash or another bash.exe to run the Agent shell tool.",
  "settings.runtimeRefresh": "Check again", "settings.runtimeInstall": "Open install command", "settings.runtimeDownload": "Open download page",
  "settings.profileIdentity": "Profile identity", "settings.uploadPhoto": "Upload profile photo", "settings.processing": "Processing…",
  "settings.changePhoto": "Change photo", "settings.addPhoto": "Add photo", "settings.localActivity": "Local activity",
  "settings.localSessions": "Local sessions", "settings.sessionTokens": "Session tokens", "settings.contextUsed": "Context used",
  "settings.enabledSkills": "Enabled skills", "settings.environment": "Environment", "settings.currentConfiguration": "Current local configuration",
  "settings.activeModel": "Active model",
  "settings.activeModelDescription": "The primary model used for conversation and tasks",
  "settings.enabledModels": "Enabled models",
  "settings.enabledModelsDescription": "Decides which models appear in the conversation model picker",
  "settings.thinkingLevelDescription": "Decides the thinking effort level for models that support thinking",
  "settings.aiConfiguration": "AI configuration", "settings.models": "Provider & Model",
  "settings.modelsDescription": "Only enabled models appear in the conversation model picker.", "settings.providersKeys": "Providers & API Keys",
  "settings.connectedCount": "{count} connected", "settings.connectedProvidersList": "Connected provider list",
  "settings.enabledCount": "{count} enabled",
  "settings.searchProviders": "Search providers", "settings.reconnect": "Reconnect",
  "settings.signIn": "Sign in", "settings.replaceKey": "Replace key", "settings.setKey": "Set key", "settings.showKey": "Show {name} API key",
  "settings.hideKey": "Hide {name} API key", "settings.copyKey": "Copy {name} API key", "settings.titleModel": "Conversation title model",
  "settings.titleModelDescription": "Automatically summarizes the first exchange into a short title", "settings.providerNotConnected": "Provider not connected",
  "settings.summaryModel": "Summary model", "settings.searchModels": "Search models", "settings.refreshModels": "Refresh providers and models",
  "settings.noModels": "No available models", "settings.noModelsDescription": "Available models appear here after you configure a provider.",
  "settings.context": "{value} context", "settings.skillsEyebrow": "Agent capabilities", "settings.skillsDescription": "Automatically discover workspace and user skills from Moros, Codex, Claude Code, Cursor, OpenCode, and .agents.",
  "settings.skillsCompatibility": "Reads the original files; MCP servers, hooks, and harness-specific tools are not imported.",
  "settings.skillsRescan": "Rescan skills",
  "settings.skillsScanning": "Scanning…",
  "settings.skillsRescanBusy": "Wait for the running task to finish before rescanning.",
  "settings.skillScope.project": "Project",
  "settings.skillScope.user": "User",
  "settings.skillScope.custom": "Custom directory",
  "settings.skillManualOnly": "Manual invocation only",
  "settings.addDirectory": "Add directory", "settings.noSkills": "No skills found", "settings.additionalDirectories": "Additional directories",
  "settings.skillsSearch": "Search skills", "settings.clearSkillsSearch": "Clear skill search",
  "settings.installedSkills": "Installed", "settings.allSkills": "All", "settings.disabledSkills": "Disabled skills",
  "settings.availableSkills": "Available skills", "settings.skillEnabled": "Enabled", "settings.skillDisabled": "Disabled",
  "settings.skillToggle": "Toggle skill {name}", "settings.skillsFilter": "Filter skills",
  "settings.dependenciesEyebrow": "System readiness",
  "settings.dependenciesDescription": "Check the Git and Bash tools Moros needs. Installation starts only after you confirm.",
  "settings.dependenciesRefresh": "Check again", "settings.dependenciesRefreshing": "Checking…",
  "settings.dependenciesReady": "{ready}/{total} ready",
  "settings.dependenciesRequiredReady": "Moros core runtime is ready",
  "settings.dependenciesRequiredMissing": "A Moros core dependency is still missing",
  "settings.dependenciesChecked": "Last checked: {time}",
  "settings.dependenciesCategory.runtime": "Moros runtime", "settings.dependenciesCategory.runtimeDescription": "Core tools used to run local Agent commands.",


  "settings.dependency.git.name": "Git", "settings.dependency.git.description": "Provides version control and is the recommended way to install Git Bash on Windows.",
  "settings.dependency.bash.name": "Bash / Git Bash", "settings.dependency.bash.description": "The command environment Moros uses for local Agent shell operations.",




  "settings.dependency.installed": "Installed", "settings.dependency.missing": "Not detected", "settings.dependency.unsupported": "Not supported on this system",
  "settings.dependency.required": "Required by Moros", "settings.dependency.optional": "Install when needed",
  "settings.dependency.version": "Version {version}", "settings.dependency.recommended": "Provided version {version}",
  "settings.dependency.install": "Download & install", "settings.dependency.reinstall": "Reinstall", "settings.dependency.openLocation": "Open location",
  "settings.dependency.officialSource": "Official source", "settings.dependency.confirmInstall": "Moros will download from the fixed source and then open the Windows installer.",
  "settings.dependency.confirm": "Confirm install", "settings.dependency.cancelDownload": "Cancel download",
  "settings.dependency.externalAction": "Open official download", "settings.dependency.externalConfirm": "Moros will open the vendor's official page. Download and installation continue in your browser.",
  "settings.dependency.externalConfirmAction": "Open official page", "settings.dependency.externalLaunching": "Opening the official page…", "settings.dependency.externalAwaitingUser": "Official page opened — continue in your browser",
  "settings.dependency.phase.queued": "Preparing the download…", "settings.dependency.phase.downloading": "Downloading",
  "settings.dependency.phase.extracting": "Download complete, extracting…", "settings.dependency.phase.installing": "Installing with winget…",
  "settings.dependency.phase.launching": "Opening the installer…", "settings.dependency.phase.awaitingUser": "Installer opened — follow its steps to finish",
  "settings.dependency.phase.completed": "Installation complete", "settings.dependency.phase.failed": "Installation failed",
  "settings.dependency.phase.cancelled": "Download cancelled", "settings.dependency.retry": "Retry", "settings.dependency.noItems": "Dependencies have not loaded yet",











  "composer.configureModel": "Configure a model to start a conversation.", "composer.configureModelAction": "No model configured — configure",
  "composer.configureCredentialsAction": "No credentials configured — configure", "composer.steer": "Steer", "composer.followUp": "Follow up", "composer.dropImages": "Drop to attach images",
  "composer.imageRules": "PNG, JPEG, WebP, or GIF · 10 MB max each", "composer.skillCommands": "Skill commands", "composer.selectedSkill": "Selected skill",
  "composer.removeSkill": "Remove skill {name}", "composer.placeholder": "Describe a task, paste an error, or ask Moros to edit code",
  "composer.steerPlaceholder": "Enter a steering instruction…", "composer.voiceStart": "Preparing voice input", "composer.voiceListening": "Listening",
  "composer.voiceProcessing": "Recognizing", "composer.voiceReady": "Voice input ready", "composer.startDesktopVoice": "Start Windows voice input",
  "composer.startBrowserVoice": "Start browser voice input", "composer.stop": "Stop", "composer.send": "Send", "composer.configureFirst": "Configure a model first",
  "composer.moreActions": "More actions", "composer.addImage": "Add image", "composer.newConversation": "New conversation",
  "composer.changeWorkspace": "Change workspace", "composer.selectModel": "Select model", "composer.addModelInSettings": "Add a model in Settings.",
  "composer.model": "Model", "composer.select": "Select", "composer.chooseWorkspace": "Choose workspace",
  "composer.estimatedBreakdown": "Estimated breakdown", "composer.viewReport": "View report", "composer.closeContext": "Close context usage",
  "composer.contextUsage": "Context usage", "composer.contextUsedPercent": "Context {percent}% used", "composer.contextUnknown": "Context usage unknown",
  "composer.contextFull": "{percent}% full", "composer.contextNoPercent": "— full", "composer.tokens": "Tokens",
  "composer.contextFixed": "Fixed context", "composer.contextRuntime": "Runtime context",
  "composer.contextViewDetails": "View {label} details", "composer.contextCategoryDetails": "{label} details",
  "composer.contextBackOverview": "Back to overview",
  "composer.segment.systemPrompt": "System prompt", "composer.segment.toolDefinitions": "Tool definitions", "composer.segment.rules": "Rules",
  "composer.segment.skills": "Skills", "composer.segment.mcpTools": "MCP & dynamic tools", "composer.segment.subagents": "Subagent definitions",
  "composer.segment.conversation": "Conversation", "composer.segment.read": "Read", "composer.segment.write": "Write",
  "composer.segment.edit": "Edit", "composer.segment.bash": "Bash", "composer.segment.otherTools": "Other tools", "composer.effort": "Effort",
  "composer.light": "Light", "composer.medium": "Medium", "composer.high": "High", "composer.extraHigh": "Extra High", "composer.max": "Max",
  "composer.addModel": "Add model", "composer.imageOnly": "Only PNG, JPEG, WebP, and GIF images are supported.",
  "composer.imageTooLarge": "Each image must be 10 MB or smaller.", "composer.imageReadFailed": "Could not read image: {name}",
  "composer.imageInvalid": "Invalid image data.", "composer.selectImageFile": "Choose an image file.", "composer.maxImages": "You can attach up to 8 images.",
  "composer.imageUnsupported": "The current model does not support images. Switch to a vision-capable model first.",
  "composer.voiceOpening": "Opening Windows voice input…", "composer.micConnecting": "Connecting to the microphone…",
  "composer.voiceProcessingPreview": "Processing speech…", "composer.voiceStartFailed": "Could not start voice input",
  "composer.voiceOpened": "Windows voice input opened", "composer.voiceRecognized": "Speech recognized",
  "composer.attachment": "Attachment {number}", "composer.removeImage": "Remove image {number}",
  "composer.queueRecall": "Withdraw and restore to the composer", "composer.queueWithdraw": "Withdraw queued message",
  "thread.aborted": "Aborted", "thread.copyReply": "Copy response", "thread.editPrompt": "Edit again", "thread.retry": "Retry",
  "thread.running": "Running", "thread.failed": "Failed",
  "thread.complete": "Complete", "thread.waitingOutput": "Waiting for output…", "thread.copyToolOutput": "Copy tool output", "thread.collapseToolOutput": "Collapse tool output",
  "thread.jumpLatest": "Jump to latest message", "thread.deny": "Deny", "thread.denying": "Denying…", "thread.allowOnce": "Allow once",
  "thread.allowSession": "Always allow this session", "thread.allowing": "Allowing…", "thread.commandApproval": "Command approval", "thread.actionApproval": "Action approval",
  "thread.commandExplanationUnavailable": "The title summary model could not explain this command.",
  "search.dialog": "Search conversations",
  "thread.thinking": "Thinking",
  "thread.summary.thought": "Thought {count} time",
  "thread.summary.thoughtPlural": "Thought {count} times",
  "thread.summary.explored": "Explored {count} file",
  "thread.summary.exploredPlural": "Explored {count} files",
  "thread.summary.commands": "Ran {count} command",
  "thread.summary.commandsPlural": "Ran {count} commands", "thread.activityStatus.working": "Agent is working", "thread.activityStatus.searching": "Agent is searching",
  "thread.activityStatus.solving": "Agent is solving",
  "thread.activity.command.active": "Running commands", "thread.activity.command.complete": "Ran commands",
  "thread.activity.command.itemActive": "Running", "thread.activity.command.itemComplete": "Ran", "thread.activity.read.active": "Reading files",
  "thread.activity.read.complete": "Read files", "thread.activity.read.itemActive": "Reading", "thread.activity.read.itemComplete": "Read",
  "thread.activity.write.active": "Writing files", "thread.activity.write.complete": "Wrote files", "thread.activity.write.itemActive": "Writing",
  "thread.activity.write.itemComplete": "Wrote", "thread.activity.edit.active": "Editing files", "thread.activity.edit.complete": "Edited files",
  "thread.activity.edit.itemActive": "Editing", "thread.activity.edit.itemComplete": "Edited", "thread.activity.search.active": "Searching files",
  "thread.activity.search.complete": "Searched files", "thread.activity.search.itemActive": "Searching", "thread.activity.search.itemComplete": "Searched",
  "thread.archive": "archive", "thread.delete": "delete", "thread.confirmAction": "Confirm {action} conversation",
  "thread.autoAction": "Automatically {action} in {seconds} seconds", "thread.doingAction": "{action} in progress",
  "thread.processing": "Processing…", "thread.undo": "Undo", "thread.copyCode": "Copy code",
  "thread.lines": "{count} lines",





  "search.clear": "Clear search", "search.results": "Search results", "search.recent": "Recent conversations", "search.noMatches": "No matching conversations",
  "search.searching": "Searching conversation content…",









  "context.title": "Current conversation context", "context.developer": "Developer", "context.refresh": "Refresh context",
  "context.close": "Close context viewer", "context.session": "Session",  "context.context": "Context",
  "context.usage": "Usage", "context.notCreated": "Not created",  "context.noUsage": "No usage data yet",

  "context.systemPrompt": "Effective system prompt", "context.messages": "Messages ({count})", "context.loading": "Loading context…",
  "context.copyCurrent": "Copy current content", "hero.prompt1": "Read this repository and summarize its architecture and entry points",
  "hero.prompt2": "Find the module most worth simplifying and propose the smallest coherent change",
  "hero.prompt3": "Run the relevant tests, locate the first real failure, and fix its root cause",
















































  "settings.profileName": "Name",
  "settings.profileNamePlaceholder": "Enter display name",
  "settings.profileHandle": "Username",
  "settings.profileHandlePlaceholder": "@username",
  "settings.profileAvatarAlt": "Profile avatar",
  "settings.searchNoResults": "No matching settings",
  "settings.copyWorkspacePath": "Copy path",
  "settings.expandWorkspacePath": "Show full path",
  "settings.collapseWorkspacePath": "Collapse path",
  "settings.quickPromptsScrollHint": "Scroll to switch",
  "settings.quickPromptsPosition": "Quick prompt {current} of {total}",
  "settings.nav.archive": "Archive",
  "settings.nav.archiveDescription": "View and restore archived conversations",
  "settings.archiveEyebrow": "Conversation archive",
  "settings.archiveDescription": "Review conversations archived from the current workspace and restore them to the session list at any time.",
  "settings.archiveRefresh": "Refresh archive list",
  "settings.archiveRestore": "Restore",
  "settings.archiveRestoreLabel": "Restore conversation {name}",
  "settings.archiveEmpty": "No archived conversations yet",
  "settings.quickPromptsNext": "Next prompt",
  "settings.quickPromptsUnsavedTitle": "Unsaved quick prompts",
  "settings.quickPromptsUnsavedBody": "Your quick prompts have unsaved changes. Save them before leaving?",
  "settings.quickPromptsUnsavedSave": "Save and leave",
  "settings.quickPromptsUnsavedDiscard": "Discard changes",
  "settings.quickPromptsUnsavedStay": "Keep editing",
  "settings.about": "About",
  "settings.aboutDescription": "The installed Moros application version.",
  "settings.aboutVersion": "Version {version}",
  "workspace.changeConfirmTitle": "Change workspace?",
  "workspace.changeConfirmBody": "A task is still running. Changing the workspace will stop it. Continue?",
  "workspace.changeConfirmConfirm": "Continue",
} satisfies Dictionary;

const de = {
  "thread.activity.exploring": "Exploring",
  "common.back": "Zurück", "common.cancel": "Abbrechen", "common.close": "Schließen", "common.change": "Ändern",
  "common.save": "Speichern", "common.saving": "Wird gespeichert…", "common.remove": "Entfernen", "common.add": "Hinzufügen",
  "common.open": "Öffnen", "common.insert": "Einfügen", "common.refresh": "Aktualisieren", "common.copy": "Kopieren",
  "common.copied": "Kopiert", "common.copyFailed": "Kopieren fehlgeschlagen", "common.active": "Aktiv", "common.use": "Verwenden",
  "common.connected": "Verbunden", "common.notConfigured": "Nicht konfiguriert", "common.notSelected": "Nicht ausgewählt",
  "common.notSet": "Nicht festgelegt", "common.ready": "Bereit", "common.required": "Erforderlich", "common.working": "Wird verarbeitet…", "common.loading": "Wird geladen…",
  "common.search": "Suchen", "common.unknown": "Unbekannt", "common.today": "Heute", "common.yesterday": "Gestern", "common.now": "jetzt",
  "common.untitledSession": "Unbenannte Unterhaltung",
  "common.done": "Fertig",
  "common.viewImage": "Bild vergrößern", "common.closeImagePreview": "Vorschau schließen",
  "language.label": "Sprache",
  "error.avatarStorage": "Der Avatar konnte nicht lokal gespeichert werden.", "error.imageRead": "Dieses Bild konnte nicht gelesen werden.",
  "error.imageType": "Wählen Sie eine Bilddatei aus.", "error.imageSize": "Das Avatarbild darf höchstens 12 MB groß sein.",
  "error.imageDimensions": "Die Bildabmessungen sind ungültig.", "error.imageProcessing": "In dieser Umgebung kann das Avatarbild nicht verarbeitet werden.",
  "language.description": "Wählen Sie die Sprache der Moros-Benutzeroberfläche.",
  "language.zh-CN": "简体中文", "language.zh-TW": "繁體中文", "language.en": "English", "language.de": "Deutsch",
  "titlebar.navigation": "Navigation", "titlebar.collapseSidebar": "Seitenleiste einklappen", "titlebar.expandSidebar": "Seitenleiste ausklappen",
  "titlebar.back": "Zurück", "titlebar.forward": "Vor", "titlebar.globalMenu": "Hauptmenü", "titlebar.file": "Datei",
  "titlebar.edit": "Bearbeiten", "titlebar.view": "Ansicht", "titlebar.help": "Hilfe", "titlebar.newConversation": "Neue Unterhaltung",
  "titlebar.openWorkspace": "Arbeitsbereich öffnen", "titlebar.settings": "Einstellungen", "titlebar.exit": "Beenden",
  "titlebar.focusComposer": "Eingabefeld fokussieren", "titlebar.searchConversations": "Unterhaltungen durchsuchen",
  "titlebar.developerContext": "Entwickler: Aktueller Kontext", "titlebar.providersModels": "Provider & Modell",
  "titlebar.skills": "Skills", "titlebar.about": "Über Moros", "titlebar.profile": "Profil", "titlebar.minimize": "Minimieren",
  "titlebar.maximize": "Maximieren", "sidebar.new": "Neu", "sidebar.search": "Suchen", "sidebar.skills": "Skills", "sidebar.sessions": "Sitzungen",


   "sidebar.noConversations": "Keine Unterhaltungen", "sidebar.legacyWorkspace": "Ältere Sitzungen", "sidebar.sessionRunning": "Unterhaltung wird ausgeführt", "sidebar.openRunningBeforeRemove": "Öffnen Sie die laufende Unterhaltung vor dem Archivieren oder Löschen", "sidebar.showMore": "Mehr anzeigen", "sidebar.showLess": "Weniger anzeigen",
  "sidebar.empty": "Sitzungen erscheinen hier nach der ersten Unterhaltung.",
  "sidebar.confirmRename": "Umbenennen bestätigen", "sidebar.cancelRename": "Umbenennen abbrechen", "sidebar.moreActions": "Weitere Aktionen",
  "sidebar.openProfile": "Profil öffnen", "sidebar.contextUsage": "Kontextnutzung", "sidebar.openWorkspace": "Arbeitsbereich öffnen",
  "sidebar.skillLibrary": "Skill-Bibliothek", "sidebar.settings": "Einstellungen",
  "sidebar.rename": "Umbenennen", "sidebar.archive": "Archivieren", "sidebar.delete": "Löschen", "sidebar.copySessionId": "Session-ID kopieren",
  "sidebar.currentWorkspace": "Aktuell",
  "sidebar.newInWorkspace": "Neue Unterhaltung im Arbeitsbereich",
  "sidebar.pinWorkspace": "Arbeitsbereich anheften", "sidebar.unpinWorkspace": "Arbeitsbereich lösen",
  "sidebar.copyWorkspacePath": "Vollständigen Pfad kopieren", "sidebar.revealInExplorer": "Im Datei-Explorer anzeigen",
  "sidebar.collapseWorkspace": "Arbeitsbereich einklappen", "sidebar.expandWorkspace": "Arbeitsbereich ausklappen",
  "sidebar.customizeWorkspace": "Symbol & Farbe anpassen",

  "sidebar.resize": "Seitenleiste skalieren", "sidebar.renameEmpty": "Der Name der Unterhaltung darf nicht leer sein.",
  "sidebar.copyIdFailed": "Session-ID konnte nicht kopiert werden",   "settings.search": "Einstellungen durchsuchen",
  "settings.category.personal": "Persönlich",
  "settings.category.system": "System & Ressourcen",
  "settings.category.ai": "KI-Konfiguration",
  "settings.navigation": "Einstellungsnavigation", "settings.nav.general": "Allgemein", "settings.nav.generalDescription": "Sprache, Kurzbefehle und Laufzeit",
  "settings.nav.profile": "Profil", "settings.nav.profileDescription": "Identität und lokale Aktivität", "settings.nav.models": "Provider & Modell",
  "settings.nav.modelsDescription": "Provider-Zugriff und Modellauswahl", "settings.nav.skills": "Skills", "settings.nav.skillsDescription": "Agent-Funktionen",
  "settings.nav.dependencies": "Abhängigkeiten", "settings.nav.dependenciesDescription": "Laufzeit und Kommandozeilenwerkzeuge",
  "settings.preferences": "Moros-Einstellungen", "settings.general": "Allgemein",
  "settings.generalDescription": "Sprache, Kurzbefehle und lokale Agent-Laufzeit verwalten.",
  "settings.commandExplanationLanguage": "Sprache der Befehlsbeschreibung",
  "settings.commandExplanationLanguageDescription": "Legt die Sprache fest, in der das Titelmodell Befehle erklärt.",
  "settings.commandExplanationLanguageAuto": "Oberflächensprache verwenden",
  "settings.composerSendKey": "Sendetaste",
  "settings.composerSendKeyDescription": "Legt fest, welche Tasten im Eingabefeld senden oder eine neue Zeile einfügen.",
  "settings.composerSendKeyEnter": "Enter sendet, Shift+Enter fügt eine neue Zeile ein",
  "settings.composerSendKeyShiftEnter": "Shift+Enter sendet, Enter fügt eine neue Zeile ein",
  "settings.appearance": "Darstellung",
  "settings.appearanceDescription": "Helles oder dunkles Design wählen oder dem System folgen.", "settings.colorTheme": "Farbschema",
  "settings.theme.system": "System", "settings.theme.systemDescription": "Dem Betriebssystem folgen", "settings.theme.light": "Hell",
  "settings.theme.lightDescription": "Kontrastreiches helles Design",   "settings.theme.dark": "Dunkel", "settings.theme.darkDescription": "Dunkles Design",
  "settings.codeFont": "Code-Schriftart",
  "settings.codeFontDescription": "Wählen Sie die Festbreitenschrift für Codeblöcke, Inline-Code und Terminalausgaben.",
  "settings.codeFont.google-sans-code": "Google Sans Code NF",
  "settings.codeFont.google-sans-codeDescription": "Geometrischer Monospace-Stil mit Entwicklersymbolen",
  "settings.codeFont.maple-mono": "Maple Mono NF CN",
  "settings.codeFont.maple-monoDescription": "Abgerundetes Monospace-Design mit CJK-Ausrichtung und Ligaturen",
  "settings.workspace": "Arbeitsbereich", "settings.workspaceDescription": "Standardordner, in dem Moros Dateien liest und Aufgaben ausführt.",
  "settings.workingDirectory": "Arbeitsverzeichnis", "settings.permissionMode": "Berechtigungsmodus",
  "settings.quickPrompts": "Schnell-Prompts", "settings.quickPromptsDescription": "Prompt-Kurzbefehle über dem Eingabefeld bearbeiten, maximal {max} Einträge.",
  "settings.quickPromptsCount": "{count}/{max} Einträge", "settings.quickPromptLabel": "Schnell-Prompt {index}",
  "settings.quickPromptPlaceholder": "Prompt eingeben, der beim Anklicken eingefügt wird", "settings.addQuickPrompt": "Schnell-Prompt hinzufügen",
  "settings.restoreQuickPromptDefaults": "Standard wiederherstellen",
  "settings.removeQuickPrompt": "Schnell-Prompt {index} entfernen", "settings.quickPromptsHint": "Gespeicherte Änderungen erscheinen sofort auf der Startseite.",
  "settings.quickPromptsRequired": "Jeder Schnell-Prompt benötigt einen Inhalt.",
  "settings.permissionDescription": "Legt fest, wann Moros vor einer Aktion nachfragt.", "settings.permission.ask": "Genehmigung anfordern",
  "settings.permission.askDescription": "Vor Shell-Befehlen, externen Änderungen oder dynamischen Tools nachfragen",
  "settings.permission.approve": "Für mich genehmigen", "settings.permission.approveDescription": "Nachweislich schreibgeschützte Aktionen automatisch zulassen",
  "settings.permission.full": "Vollzugriff", "settings.permission.fullDescription": "Uneingeschränkter Zugriff auf Internet und lokale Dateien",
  "settings.runtime": "Laufzeit", "settings.runtimeDescription": "Laufzeitvoraussetzungen für lokale Agent-Aufgaben.",
  "settings.runtimeAvailable": "Das Pi-Bash-Werkzeug kann Shell-Befehle ausführen.", "settings.runtimeConfigured": "Das Pi-Bash-Werkzeug verwendet den in settings.json konfigurierten shellPath.",
  "settings.runtimeMissing": "Moros benötigt Git Bash oder eine andere bash.exe für das Shell-Werkzeug des Agents.",
  "settings.runtimeRefresh": "Erneut prüfen", "settings.runtimeInstall": "Installationsbefehl öffnen", "settings.runtimeDownload": "Downloadseite öffnen",
  "settings.profile": "Profil", "settings.localIdentity": "Lokale Identität", "settings.profileIdentity": "Profilidentität",
  "settings.uploadPhoto": "Profilbild hochladen", "settings.processing": "Wird verarbeitet…", "settings.changePhoto": "Foto ändern",
  "settings.addPhoto": "Foto hinzufügen", "settings.localActivity": "Lokale Aktivität", "settings.localSessions": "Lokale Unterhaltungen",
  "settings.sessionTokens": "Session-Tokens", "settings.contextUsed": "Kontext verwendet", "settings.enabledSkills": "Aktivierte Skills",
  "settings.environment": "Umgebung", "settings.currentConfiguration": "Aktuelle lokale Konfiguration",   "settings.activeModel": "Aktives Modell",
  "settings.activeModelDescription": "Das Hauptmodell für Unterhaltungen und Aufgaben",
  "settings.enabledModels": "Aktivierte Modelle",
  "settings.enabledModelsDescription": "Bestimmt, welche Modelle in der Modellauswahl erscheinen",
  "settings.thinkingLevelDescription": "Bestimmt die Denktiefe für Modelle, die das Denken unterstützen",
  "settings.aiConfiguration": "KI-Konfiguration", "settings.models": "Provider & Modell",
  "settings.modelsDescription": "Nur aktivierte Modelle erscheinen in der Modellauswahl.", "settings.providersKeys": "Provider & API-Schlüssel",
  "settings.connectedCount": "{count} verbunden", "settings.connectedProvidersList": "Liste verbundener Provider",
  "settings.enabledCount": "{count} aktiviert",
  "settings.searchProviders": "Provider suchen", "settings.reconnect": "Neu verbinden",
  "settings.signIn": "Anmelden", "settings.replaceKey": "Schlüssel ersetzen", "settings.setKey": "Schlüssel festlegen",
  "settings.titleModel": "Modell für Unterhaltungstitel", "settings.titleModelDescription": "Fasst den ersten Austausch automatisch in einem kurzen Titel zusammen",
  "settings.providerNotConnected": "Provider nicht verbunden", "settings.searchModels": "Modelle suchen",
  "settings.refreshModels": "Provider und Modelle aktualisieren", "settings.noModels": "Keine verfügbaren Modelle",
  "settings.noModelsDescription": "Nach der Konfiguration eines Providers erscheinen verfügbare Modelle hier.",
  "settings.skillsDescription": "Workspace- und Benutzer-Skills von Moros, Codex, Claude Code, Cursor, OpenCode und .agents automatisch erkennen.", "settings.addDirectory": "Ordner hinzufügen",
  "settings.skillsCompatibility": "Liest die Originaldateien; MCP-Server, Hooks und harness-spezifische Tools werden nicht importiert.",
  "settings.skillsRescan": "Skills neu scannen",
  "settings.skillsScanning": "Wird gescannt…",
  "settings.skillsRescanBusy": "Warten Sie vor dem erneuten Scan auf den Abschluss der laufenden Aufgabe.",
  "settings.skillScope.project": "Projekt",
  "settings.skillScope.user": "Benutzer",
  "settings.skillScope.custom": "Eigener Ordner",
  "settings.skillManualOnly": "Nur manueller Aufruf",
  "settings.noSkills": "Keine Skills gefunden", "settings.additionalDirectories": "Zusätzliche Ordner",
  "settings.skillsSearch": "Skills durchsuchen", "settings.clearSkillsSearch": "Skill-Suche löschen",
  "settings.installedSkills": "Installiert", "settings.allSkills": "Alle", "settings.disabledSkills": "Deaktivierte Skills",
  "settings.availableSkills": "Verfügbare Skills", "settings.skillEnabled": "Aktiv", "settings.skillDisabled": "Inaktiv",
  "settings.skillToggle": "Skill {name} umschalten", "settings.skillsFilter": "Skills filtern",
  "settings.dependenciesEyebrow": "Systembereitschaft",
  "settings.dependenciesDescription": "Git und Bash für Moros prüfen. Eine Installation startet erst nach Ihrer Bestätigung.",
  "settings.dependenciesRefresh": "Erneut prüfen", "settings.dependenciesRefreshing": "Wird geprüft…",
  "settings.dependenciesReady": "{ready}/{total} bereit",
  "settings.dependenciesRequiredReady": "Die Moros-Kernlaufzeit ist bereit",
  "settings.dependenciesRequiredMissing": "Eine Moros-Kernabhängigkeit fehlt noch",
  "settings.dependenciesChecked": "Zuletzt geprüft: {time}",
  "settings.dependenciesCategory.runtime": "Moros-Laufzeit", "settings.dependenciesCategory.runtimeDescription": "Grundwerkzeuge für lokale Agent-Befehle.",


  "settings.dependency.git.name": "Git", "settings.dependency.git.description": "Versionsverwaltung und empfohlener Installationsweg für Git Bash unter Windows.",
  "settings.dependency.bash.name": "Bash / Git Bash", "settings.dependency.bash.description": "Befehlsumgebung für lokale Shell-Aktionen des Moros Agents.",




  "settings.dependency.installed": "Installiert", "settings.dependency.missing": "Nicht erkannt", "settings.dependency.unsupported": "Auf diesem System nicht unterstützt",
  "settings.dependency.required": "Für Moros erforderlich", "settings.dependency.optional": "Bei Bedarf installieren",
  "settings.dependency.version": "Version {version}", "settings.dependency.recommended": "Bereitgestellte Version {version}",
  "settings.dependency.install": "Herunterladen & installieren", "settings.dependency.reinstall": "Neu installieren", "settings.dependency.openLocation": "Speicherort öffnen",
  "settings.dependency.officialSource": "Offizielle Quelle", "settings.dependency.confirmInstall": "Moros lädt aus der festgelegten Quelle herunter und öffnet anschließend den Windows-Installer.",
  "settings.dependency.confirm": "Installation bestätigen", "settings.dependency.cancelDownload": "Download abbrechen",
  "settings.dependency.externalAction": "Offiziellen Download öffnen", "settings.dependency.externalConfirm": "Moros öffnet die offizielle Herstellerseite. Download und Installation werden im Browser fortgesetzt.",
  "settings.dependency.externalConfirmAction": "Offizielle Seite öffnen", "settings.dependency.externalLaunching": "Offizielle Seite wird geöffnet…", "settings.dependency.externalAwaitingUser": "Offizielle Seite geöffnet — im Browser fortfahren",
  "settings.dependency.phase.queued": "Download wird vorbereitet…", "settings.dependency.phase.downloading": "Wird heruntergeladen",
  "settings.dependency.phase.extracting": "Download abgeschlossen, wird entpackt…", "settings.dependency.phase.installing": "Installation über winget…",
  "settings.dependency.phase.launching": "Installer wird geöffnet…", "settings.dependency.phase.awaitingUser": "Installer geöffnet – folgen Sie den Schritten zum Abschluss",
  "settings.dependency.phase.completed": "Installation abgeschlossen", "settings.dependency.phase.failed": "Installation fehlgeschlagen",
  "settings.dependency.phase.cancelled": "Download abgebrochen", "settings.dependency.retry": "Erneut versuchen", "settings.dependency.noItems": "Abhängigkeiten wurden noch nicht geladen",











  "composer.configureModel": "Konfigurieren Sie ein Modell, um zu beginnen.", "composer.configureModelAction": "Kein Modell konfiguriert – konfigurieren",
  "composer.configureCredentialsAction": "Keine Zugangsdaten konfiguriert – konfigurieren", "composer.steer": "Steuern", "composer.followUp": "Nachfrage",
  "composer.dropImages": "Loslassen, um Bilder anzuhängen", "composer.skillCommands": "Skill-Befehle", "composer.selectedSkill": "Ausgewählter Skill",
  "composer.imageRules": "PNG, JPEG, WebP oder GIF · höchstens 10 MB pro Bild",
  "composer.removeSkill": "Skill {name} entfernen", "composer.placeholder": "Aufgabe beschreiben, Fehler einfügen oder Moros Code ändern lassen",
  "composer.steerPlaceholder": "Steuerungsanweisung eingeben…", "composer.voiceStart": "Spracheingabe wird vorbereitet",
  "composer.voiceListening": "Hört zu", "composer.voiceProcessing": "Wird erkannt", "composer.voiceReady": "Spracheingabe bereit",
  "composer.startDesktopVoice": "Windows-Spracheingabe starten", "composer.startBrowserVoice": "Browser-Spracheingabe starten",
  "composer.stop": "Stopp", "composer.send": "Senden", "composer.configureFirst": "Zuerst ein Modell konfigurieren",
  "composer.moreActions": "Weitere Aktionen", "composer.addImage": "Bild hinzufügen", "composer.newConversation": "Neue Unterhaltung",
  "composer.changeWorkspace": "Arbeitsbereich wechseln", "composer.selectModel": "Modell auswählen", "composer.addModelInSettings": "Fügen Sie in den Einstellungen ein Modell hinzu.",
  "composer.model": "Modell", "composer.select": "Auswählen", "composer.chooseWorkspace": "Arbeitsbereich auswählen",
  "composer.estimatedBreakdown": "Geschätzte Aufteilung", "composer.viewReport": "Bericht anzeigen", "composer.closeContext": "Kontextnutzung schließen",
  "composer.contextUsage": "Kontextnutzung", "composer.contextUsedPercent": "Kontext zu {percent}% verwendet", "composer.contextUnknown": "Kontextnutzung unbekannt",
  "composer.contextFull": "{percent}% belegt", "composer.contextNoPercent": "— belegt", "composer.tokens": "Tokens",
  "composer.contextFixed": "Fester Kontext", "composer.contextRuntime": "Laufzeitkontext",
  "composer.contextViewDetails": "Details für {label} anzeigen", "composer.contextCategoryDetails": "Details für {label}",
  "composer.contextBackOverview": "Zurück zur Übersicht",
  "composer.segment.systemPrompt": "System-Prompt", "composer.segment.toolDefinitions": "Tool-Definitionen", "composer.segment.rules": "Regeln",
  "composer.segment.skills": "Skills", "composer.segment.mcpTools": "MCP & dynamische Tools", "composer.segment.subagents": "Subagent-Definitionen",
  "composer.segment.conversation": "Unterhaltung", "composer.segment.read": "Read", "composer.segment.write": "Write",
  "composer.segment.edit": "Edit", "composer.segment.bash": "Bash", "composer.segment.otherTools": "Andere Tools", "composer.effort": "Denktiefe",
  "composer.light": "Leicht", "composer.medium": "Mittel", "composer.high": "Hoch", "composer.extraHigh": "Sehr hoch", "composer.max": "Maximal",
  "composer.addModel": "Modell hinzufügen", "composer.imageOnly": "Nur PNG-, JPEG-, WebP- und GIF-Bilder werden unterstützt.",
  "composer.imageTooLarge": "Ein Bild darf höchstens 10 MB groß sein.", "composer.imageReadFailed": "Bild konnte nicht gelesen werden: {name}",
  "composer.imageInvalid": "Ungültige Bilddaten.", "composer.selectImageFile": "Wählen Sie eine Bilddatei.", "composer.maxImages": "Sie können bis zu 8 Bilder anhängen.",
  "composer.imageUnsupported": "Das aktuelle Modell unterstützt keine Bilder. Wechseln Sie zuerst zu einem bildfähigen Modell.",
  "composer.voiceOpening": "Windows-Spracheingabe wird geöffnet…", "composer.micConnecting": "Mikrofon wird verbunden…",
  "composer.voiceProcessingPreview": "Sprache wird verarbeitet…", "composer.voiceStartFailed": "Spracheingabe konnte nicht gestartet werden",
  "composer.voiceOpened": "Windows-Spracheingabe geöffnet", "composer.voiceRecognized": "Sprache erkannt",
  "composer.attachment": "Anhang {number}", "composer.removeImage": "Bild {number} entfernen",
  "composer.queueRecall": "Zurückziehen und ins Eingabefeld übernehmen", "composer.queueWithdraw": "Wartende Nachricht zurückziehen",
  "thread.aborted": "Abgebrochen", "thread.copyReply": "Antwort kopieren", "thread.editPrompt": "Erneut bearbeiten",
  "thread.retry": "Erneut versuchen", "thread.running": "Wird ausgeführt",
  "thread.failed": "Fehlgeschlagen", "thread.complete": "Abgeschlossen", "thread.waitingOutput": "Warten auf Ausgabe…",
  "thread.copyToolOutput": "Tool-Ausgabe kopieren", "thread.collapseToolOutput": "Tool-Ausgabe einklappen", "thread.jumpLatest": "Zur neuesten Nachricht", "thread.deny": "Ablehnen",
  "thread.denying": "Wird abgelehnt…", "thread.allowOnce": "Einmal erlauben",
  "thread.allowSession": "Für diese Sitzung immer erlauben", "thread.allowing": "Wird erlaubt…",
  "thread.commandApproval": "Befehlsfreigabe",
  "thread.actionApproval": "Aktionsfreigabe",
  "thread.commandExplanationUnavailable": "Das Titelmodell konnte diesen Befehl nicht erklären.",
  "search.dialog": "Unterhaltungen durchsuchen", "search.clear": "Suche löschen",
  "thread.thinking": "Denkvorgang",
  "thread.summary.thought": "1-mal nachgedacht",
  "thread.summary.thoughtPlural": "{count}-mal nachgedacht",
  "thread.summary.explored": "1 Datei untersucht",
  "thread.summary.exploredPlural": "{count} Dateien untersucht",
  "thread.summary.commands": "1 Befehl ausgeführt",
  "thread.summary.commandsPlural": "{count} Befehle ausgeführt", "thread.activityStatus.working": "Agent arbeitet", "thread.activityStatus.searching": "Agent sucht",
  "thread.activityStatus.solving": "Agent löst die Aufgabe",
  "thread.activity.command.active": "Befehle werden ausgeführt", "thread.activity.command.complete": "Befehle ausgeführt",
  "thread.activity.command.itemActive": "Wird ausgeführt", "thread.activity.command.itemComplete": "Ausgeführt", "thread.activity.read.active": "Dateien werden gelesen",
  "thread.activity.read.complete": "Dateien gelesen", "thread.activity.read.itemActive": "Wird gelesen", "thread.activity.read.itemComplete": "Gelesen",
  "thread.activity.write.active": "Dateien werden geschrieben", "thread.activity.write.complete": "Dateien geschrieben", "thread.activity.write.itemActive": "Wird geschrieben",
  "thread.activity.write.itemComplete": "Geschrieben", "thread.activity.edit.active": "Dateien werden bearbeitet", "thread.activity.edit.complete": "Dateien bearbeitet",
  "thread.activity.edit.itemActive": "Wird bearbeitet", "thread.activity.edit.itemComplete": "Bearbeitet", "thread.activity.search.active": "Dateien werden durchsucht",
  "thread.activity.search.complete": "Dateien durchsucht", "thread.activity.search.itemActive": "Wird gesucht", "thread.activity.search.itemComplete": "Gesucht",
  "thread.archive": "archivieren", "thread.delete": "löschen", "thread.confirmAction": "Unterhaltung {action} bestätigen",
  "thread.autoAction": "In {seconds} Sekunden automatisch {action}", "thread.doingAction": "Wird {action}",
  "thread.processing": "Wird verarbeitet…", "thread.undo": "Rückgängig", "thread.copyCode": "Code kopieren",
  "thread.lines": "{count} Zeilen",





  "search.results": "Suchergebnisse", "search.recent": "Letzte Unterhaltungen", "search.noMatches": "Keine passenden Unterhaltungen",
  "search.searching": "Unterhaltungsinhalte werden durchsucht…",










  "context.title": "Aktueller Unterhaltungskontext", "context.developer": "Entwickler", "context.refresh": "Kontext aktualisieren",
  "context.close": "Kontextansicht schließen", "context.session": "Session",  "context.context": "Kontext",
  "context.usage": "Nutzung", "context.notCreated": "Noch nicht erstellt",
  "context.noUsage": "Noch keine Nutzungsdaten",
   "context.systemPrompt": "Effektiver System-Prompt", "context.messages": "Nachrichten ({count})",
  "context.loading": "Kontext wird geladen…", "context.copyCurrent": "Aktuellen Inhalt kopieren",
  "settings.showKey": "{name}-API-Schlüssel anzeigen", "settings.hideKey": "{name}-API-Schlüssel ausblenden", "settings.copyKey": "{name}-API-Schlüssel kopieren",
  "settings.summaryModel": "Zusammenfassungsmodell", "settings.context": "{value} Kontext", "settings.skillsEyebrow": "Agent-Funktionen",
  "hero.prompt1": "Dieses Repository lesen und Architektur sowie Einstiegspunkte zusammenfassen",
  "hero.prompt2": "Das sinnvollste Vereinfachungsziel finden und die kleinste kohärente Änderung vorschlagen",
  "hero.prompt3": "Relevante Tests ausführen, den ersten echten Fehler finden und die Ursache beheben",
















































  "settings.profileName": "Name", "settings.profileNamePlaceholder": "Anzeigename eingeben",
  "settings.profileHandle": "Benutzername", "settings.profileHandlePlaceholder": "@benutzername",
  "settings.profileAvatarAlt": "Profil-Avatar",
  "settings.searchNoResults": "Keine passenden Einstellungen", "settings.copyWorkspacePath": "Pfad kopieren",
  "settings.expandWorkspacePath": "Vollständigen Pfad anzeigen", "settings.collapseWorkspacePath": "Pfad einklappen",
  "settings.quickPromptsScrollHint": "Scrollen zum Wechseln", "settings.quickPromptsPosition": "Schnellaktion {current} von {total}",
  "settings.nav.archive": "Archiv",
  "settings.nav.archiveDescription": "Archivierte Unterhaltungen ansehen und wiederherstellen",
  "settings.archiveEyebrow": "Unterhaltungsarchiv",
  "settings.archiveDescription": "Sehen Sie die archivierten Unterhaltungen dieses Arbeitsbereichs ein und stellen Sie sie jederzeit in der Sitzungsliste wieder her.",
  "settings.archiveRefresh": "Archivliste aktualisieren",
  "settings.archiveRestore": "Wiederherstellen",
  "settings.archiveRestoreLabel": "Unterhaltung {name} wiederherstellen",
  "settings.archiveEmpty": "Noch keine archivierten Unterhaltungen",
  "settings.quickPromptsNext": "Nächster Prompt",
  "settings.quickPromptsUnsavedTitle": "Nicht gespeicherte Schnell-Prompts",
  "settings.quickPromptsUnsavedBody": "Ihre Schnell-Prompts enthalten nicht gespeicherte Änderungen. Vor dem Verlassen speichern?",
  "settings.quickPromptsUnsavedSave": "Speichern und verlassen",
  "settings.quickPromptsUnsavedDiscard": "Änderungen verwerfen",
  "settings.quickPromptsUnsavedStay": "Weiter bearbeiten",
  "settings.about": "Über",
  "settings.aboutDescription": "Die installierte Moros-Anwendungsversion.",
  "settings.aboutVersion": "Version {version}",
  "workspace.changeConfirmTitle": "Arbeitsbereich wechseln?",
  "workspace.changeConfirmBody": "Eine Aufgabe wird noch ausgeführt. Beim Wechsel des Arbeitsbereichs wird sie beendet. Fortfahren?",
  "workspace.changeConfirmConfirm": "Fortfahren",
} satisfies Dictionary;

const dictionaries = { "zh-CN": zhCN, "zh-TW": zhTW, en, de } satisfies Record<AppLanguage, Dictionary>;

export function translate(
  language: AppLanguage,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  const template = dictionaries[language]?.[key] ?? zhCN[key];
  if (!values) return template;
  return template.replace(/\{([^}]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function localeFor(language: AppLanguage): string {
  return language;
}

export function useI18n(): {
  language: AppLanguage;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
} {
  const language = useMoros((state) => state.settings?.language ?? "zh-CN");
  return {
    language,
    t: (key, values) => translate(language, key, values),
  };
}
