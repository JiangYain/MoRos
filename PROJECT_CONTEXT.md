# Moros 项目上下文

> 当前实现索引，不是产品愿景或发布承诺。事实优先级：当前代码与锁文件 → 测试和 CI → 本文。

## 60 秒快速理解

Moros 是基于 Pi Agent Runtime 的通用 Coding Agent。真正运行的应用位于 [`moros/`](moros/)：Electron 主进程托管 Agent、模型认证、设置、依赖管理和 loopback Web API；React 渲染层同时供 Electron 窗口与本机浏览器使用。

当前核心能力：

- Pi Agent 会话、流式文本/思考/工具事件、图片附件和后台运行会话；
- Provider 认证、模型选择、Thinking Level、标题模型与上下文用量；
- ask / approve / full 三种工具权限模式和会话级审批；
- 工作区切换、会话搜索、重命名、归档、删除与恢复；
- 本地 Skills 动态发现、启停和额外目录；
- Git 与 Bash 运行环境检测；
- 简体中文、繁体中文、英语、德语，以及浅色/深色/跟随系统主题；
- Electron IPC 与本机 Web RPC/SSE 共用同一后端状态。

已经明确移除：客户档案、听力图、助听器品牌、厂商验配软件依赖、Phonak/Widex 自动化 Skill、Target UIA 调查资产及相关宣传站点。Moros 不包含实验 Runner，也不承担医疗、听力或设备控制职责。

## 仓库地图

| 路径 | 角色 |
| --- | --- |
| `moros/src/main/` | Electron 主进程、Agent、认证、设置、依赖与 Web server |
| `moros/src/preload/` | Electron contextBridge |
| `moros/src/renderer/` | React UI 与浏览器入口 |
| `moros/src/renderer/src/styles/*/` | Global、Sidebar、Composer、Thread、Panels 分域样式；各目录以 `index.css` 固定级联顺序 |
| `moros/src/shared/` | IPC/Web 共享类型和传输契约 |
| `moros/tests/` | Node 单元与行为测试 |
| `moros/scripts/` | Pi 准备、Provider audit 与 Electron smoke |
| `moros/vendor/pi/` | 固定提交的 Pi 子模块；不要直接编辑 |
| `.github/workflows/` | CI 真相 |

## 运行架构

```text
Electron renderer ── IPC ──┐
                           ├─ MorosBackendApi ─ AgentService ─ Pi Agent Runtime
Browser renderer ─ RPC/SSE ┘           │
                                       ├─ settings / auth / sessions
                                       └─ dependency and skill discovery
```

- [`startApplication`](moros/src/main/index.ts) 创建一组 `AgentService`、`AuthLoginController`、`DependencyManager` 和共享后端 API。
- Electron 使用 [`preload/index.ts`](moros/src/preload/index.ts)；浏览器使用 [`web-api.ts`](moros/src/renderer/src/web-api.ts)。两者都实现 [`MorosApi`](moros/src/shared/types.ts)。
- 主进程事件同时发往 Electron IPC 与 Web SSE；Web 重连后用 `init` 重新同步。
- 对话由 Pi `SessionManager` 持久化为 JSONL；设置、认证和会话是不同存储。

## 开发与端口

所有 npm 命令从 `moros/` 运行：

```powershell
git submodule update --init --recursive
Set-Location moros
npm ci
npm run dev
```

开发模式：

- renderer 默认 `127.0.0.1:53210`；
- API 默认 `127.0.0.1:53211`；
- 用环境变量 `MOROS_WEB_PORT` 与 `MOROS_WEB_API_PORT` 改端口；
- Vite 将 `/api` 代理到主进程 API；浏览器和 Electron 共享状态。

生产 preview 由主进程在 `MOROS_WEB_PORT` 同时服务静态页面、RPC 与 SSE。Web 仅监听 loopback，不是多用户或远程服务。

## 关键边界

- `moros/vendor/pi` 只通过父仓库 gitlink 更新。
- Provider live audit、模型消息和登录可能联网或计费；静态 audit 不访问外部端点。
- 工具审批不是操作系统沙箱；workspace 内扩展仍按受信代码载入。
- 发布、远端覆盖、合并和用户数据删除必须另行授权。
- 失败时保留第一个真实错误；不要通过跳过 Pi 构建、清理用户设置或破坏性 Git 命令制造假绿。

## 验证矩阵

| 修改 | 最小验证 |
| --- | --- |
| 共享类型 / RPC / store | `npm run typecheck` + 相关 unit |
| 主进程或会话生命周期 | `npm run typecheck` + `npm run test:unit` |
| UI / 样式 /入口 | 上述检查 + `npm run build`；必要时 smoke |
| Provider metadata | Provider tests + `npm run audit:providers:static` |
| Pi gitlink | `npm ci` → typecheck → unit → static audit → build |

常用完整本地检查：

```powershell
npm run typecheck
npm run test:unit
npm run audit:providers:static
npm run build
```

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `moros/src/main/index.ts` | 应用启动、窗口、Web server 与关闭 |
| `moros/src/main/agent.ts` | Pi 会话、模型、设置和事件协调 |
| `moros/src/main/moros-api.ts` | 共享业务 API |
| `moros/src/main/moros-context.ts` | Moros 通用 Coding Agent persona 与语言注入 |
| `moros/src/shared/types.ts` | 共享契约 |
| `moros/src/shared/transport-contract.ts` | IPC/Web 方法注册与参数校验 |
| `moros/src/renderer/src/App.tsx` | 主布局和导航历史 |
| `moros/src/renderer/src/store.ts` | Zustand 状态入口 |
| `moros/src/renderer/src/components/Sidebar.tsx` | 品牌、搜索、会话与设置导航 |
| `moros/src/renderer/src/components/Thread.tsx` | 对话、工具和审批展示 |
| `moros/src/renderer/src/i18n.ts` | 四语言 UI 文案 |
| `moros/src/renderer/src/styles/*/index.css` | 五个样式模块的稳定导入接口；新增规则进入所属模块，不再堆回单个巨型 CSS |
