# Moros

基于 [Pi Agent Runtime](https://github.com/earendil-works/pi) 的通用 Coding Agent，提供 Electron 桌面端与本机 Web 界面。

## 能力

- 多 Provider 模型、认证、Thinking Level 与标题模型；
- 流式对话、Thinking、工具调用、审批和后台运行会话；
- 工作区切换、会话搜索、重命名、归档、删除与恢复；
- 图片附件、语音输入、Quick Prompts 和上下文用量；
- 本地 Skill 动态发现、启停与额外目录；
- Git/Bash 环境检测；
- 简体中文、繁体中文、英语、德语；
- Electron IPC 与 Web RPC/SSE 共享同一后端。

Moros 是通用 Coding Agent，不包含客户档案、听力图、医疗决策、实验 Runner 或厂商桌面软件控制。

## 开发

推荐 Node 24。

```powershell
git submodule update --init --recursive
Set-Location moros
npm ci
npm run dev
```

开发模式默认端口：

- Web：`http://127.0.0.1:53210`
- API：`http://127.0.0.1:53211`

可通过环境变量 `MOROS_WEB_PORT` 和 `MOROS_WEB_API_PORT` 修改。Web 仅监听本机回环地址。

## 跨 harness Skill 发现

启动和切换会话/工作区时，Moros 自动发现有效的 `SKILL.md`，直接读取原位置，不复制或修改其他软件的文件。

| 来源 | 项目目录 | 用户目录 |
| --- | --- | --- |
| Moros | `.moros/skills` | `~/.moros/skills` |
| Agent Skills | `.agents/skills` | `~/.agents/skills` |
| Codex 兼容目录 | `.codex/skills` | `~/.codex/skills` |
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| Cursor | `.cursor/skills` | `~/.cursor/skills` |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` |
| Pi | `.pi/skills` | `~/.pi/agent/skills` |

目录约定参考 [Codex](https://developers.openai.com/codex/skills/)、[Claude Code](https://code.claude.com/docs/en/skills)、[Cursor](https://cursor.com/docs/skills) 和 [OpenCode](https://opencode.ai/docs/skills/) 的官方文档；Moros 共享标准 Skill 文件，不模拟各 harness 的全部加载语义。

- 项目目录向上识别到最近的 Git 仓库根；保留工作区普通目录的三层发现和手动添加目录。
- 标准 Skill 集合最多递归六层，支持符号链接、Codex `.system` 和 Skill 内显式的 `skills/` 子集合；同一实体 Skill 仅加载一次，跳过依赖与构建目录。
- 保留 Pi 原生来源的解析顺序；自动发现的外部同名 Skill 按项目、额外目录、用户目录排序，先发现者生效。项目内按当前目录到仓库根、表格来源顺序处理。
- 在其他软件中新增或删除 Skill 后，进入「技能 → 重新扫描」即可更新当前会话；任务执行中不允许刷新，刷新失败保留原会话。空会话保留工作区和会话 ID，尚未落盘的非空会话会拒绝刷新，避免内容丢失。
- Moros 的启停状态独立管理；停用项仍显示原描述和来源。`disable-model-invocation: true` 保持仅手动调用。
- 不自动扫描插件缓存或导入 MCP、hooks、专属工具、凭据以及其他 harness 的权限配置。依赖这些能力的 Skill 仍需单独适配；没有有效描述的文件按 Pi 的验证规则跳过。
- 支持 `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`XDG_CONFIG_HOME` 和 `OPENCODE_CONFIG_DIR`。设置 `MOROS_SKILL_HOME` 可隔离用户级扫描根，同时忽略上述外部目录覆盖，供测试或隔离配置使用。

## 验证

### 右侧工作面板

标题栏入口和聊天中的文件／URL 可以打开任务工作面板。支持文件与文档预览、真实终端、Electron 隔离浏览器及页面批注、Git Review 与统一待反馈列表。标签、宽度和批注按工作区与会话恢复。完整能力、快捷键与真实限制见 [Workbench 文档](docs/workbench.md)。

```powershell
npm run typecheck
npm run test:unit
npm run audit:providers:static
npm run build
npm run test:smoke
npm run test:workbench
```

`audit:providers:static` 不访问外部端点。默认 audit 会探测网络；`--live` 与 `strict-live` 会发真实模型请求并可能计费。

## 代码地图

- `src/main/`：Electron 主进程、Agent、设置、认证、依赖与 Web server
- `src/preload/`：Electron bridge
- `src/renderer/`：React UI
- `src/renderer/src/styles/{Global,Sidebar,Composer,Thread,Panels}/`：按界面域拆分的样式模块
- `src/shared/`：IPC/Web 共享契约
- `tests/`：Node 单元与行为测试
- `scripts/`：Pi 准备、Provider audit 与 Electron smoke
- `vendor/pi/`：固定提交的 Pi 子模块

更完整的架构和工作协议见 [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md)。
