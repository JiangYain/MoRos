# Compass

> 新会话、架构、数据边界与验证入口见仓库根目录的 [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md)。

基于 [Pi Agent Runtime](https://github.com/earendil-works/pi) 的智能助听器验配辅助决策应用（Electron + 本地 Web + TypeScript + React）。

把听力数据与主观主诉，转化为**可解释、可确认、可执行、可验证、可记录**的验配决策。

## 功能

- **Pi 作为 Agent 基座**：主进程内运行 `@earendil-works/pi-coding-agent` 会话；当前 Provider 与模型目录来自固定提交的 Pi 子模块。
- **SKILL 动态加载**：自动扫描工作目录及自定义目录下的 `SKILL.md` 技能包（如 `phonak-target-control`），可在技能库面板启用/停用，输入 `/` 触发技能命令。
- **Codex 式对话体验**：流式回复、思考块折叠、工具执行卡片、转向/追问队列、上下文用量与费用统计。
- **精简任务输入区**：工作区入口、模型与思考深度胶囊、可点击上下文用量环、桌面端系统语音输入（`Win+H`）/ Web 端浏览器语音识别，以及统一的发送/停止控制。
- **会话与客户导航**：会话自动持久化（Pi SessionManager），侧边栏按客户线索归组，支持搜索、重命名、删除和归档，并提供本地操作员菜单。
- **桌面与 Web 双入口**：一次启动同时打开 Electron 桌面窗口，并在 `http://127.0.0.1:5173` 提供完整 Web 页面；两端共享后端 Agent、会话、客户库和流式事件，各 renderer 的 localStorage 偏好彼此独立。
- **设计系统**：高端医疗科技风 —— Cormorant Garamond + Inter 双字形，黑白灰 + 陶土红（#C74634），以中性胶囊、柔和圆角和克制动效构成 Codex 式桌面界面，支持 `prefers-reduced-motion`。

## 开发

```bash
npm install
npm run dev        # 启动 Web（HMR）和 Electron，浏览器访问 http://127.0.0.1:5173
npm run test:unit  # 运行本地单元与行为测试
```

## 构建与运行

```bash
npm run build      # 打包 main / preload / renderer 到 out/
npm start          # 自动构建，同时启动 Web 和 Electron
npm run preview    # 不重新构建，直接运行当前 out/ 产物
```

## UI 冒烟测试

```bash
npm run build
npm run test:smoke       # 覆盖设置、模型、上下文、权限、图片附件和响应式侧栏
```

## 配置

- 首次使用：在 **Settings → 模型提供方** 按该 Provider 支持的 API Key、OAuth 或环境配置完成认证，然后在输入框的 Model 选择器中切换模型。
- 工作目录：Agent 的文件与命令均相对该目录执行，目录内的 `SKILL.md` 子目录会被自动发现；开发模式默认指向 `FAI/`，打包模式则根据应用安装位置计算默认目录，也可从 Composer 的 workspace 入口更换。
- 设置持久化在 `%APPDATA%/compass/compass-settings.json`；API Key 存于 Pi 的 `~/.pi/` 认证存储。
- 客户档案、助听器品牌和会话归属存储在 `%APPDATA%/compass/compass.sqlite3`。首次启动新版时会把旧的 `localStorage` 客户档案事务性导入 SQLite，成功后删除旧键。
- Web 服务仅监听本机回环地址。可用 `COMPASS_WEB_PORT` 修改默认 Web 端口 `5173`；开发模式内部 API 端口可用 `COMPASS_WEB_API_PORT` 修改（默认 `4317`）。

## 客户数据库

Compass 使用 Electron 内置的 `node:sqlite`，不依赖需要针对 Electron ABI 重编译的原生 npm 模块。数据库由主进程独占访问，渲染层只能通过类型化 IPC / 本地 Web RPC 操作客户数据。

- Schema 使用 `PRAGMA user_version` 做版本迁移，并启用外键、5 秒 busy timeout、`synchronous=NORMAL` 和 WAL。
- `clients` 保存客户主档；`client_hearing_aid_brands` 保存多选品牌；`session_client_assignments` 保存会话归属；`app_metadata` 记录迁移元数据。
- 所有多表写入均在 `BEGIN IMMEDIATE` 事务中完成。旧版 `unitron`、`oticon`、`other` 品牌 ID 会继续保留，即使当前紧凑表单不再提供这些选项。
- 正常关闭时会执行 WAL checkpoint。备份时建议先退出 Compass，再复制 `compass.sqlite3`。
- 自动化测试可通过 `COMPASS_USER_DATA_DIR` 使用隔离的用户目录，或通过 `COMPASS_DATABASE_PATH=:memory:` 使用内存数据库。

## 目录结构

```
src/
  main/       Electron 主进程：Pi AgentService、本地 Web/API、技能发现、设置
  preload/    contextBridge 暴露类型化 IPC（window.compass）
  renderer/   React UI：设计系统、Hero、对话流、技能/设置面板
  shared/     主进程与渲染层共享的 IPC 类型契约
scripts/
  smoke.mjs   Playwright UI 冒烟测试
```
