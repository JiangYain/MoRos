# Compass

基于 [Pi Agent Runtime](https://github.com/badlogic/pi-mono) 的智能助听器验配辅助决策桌面应用（Electron + TypeScript + React）。

把听力数据与主观主诉，转化为**可解释、可确认、可执行、可验证、可记录**的验配决策。

## 功能

- **Pi 作为 Agent 基座**：主进程内运行 `@mariozechner/pi-coding-agent` 会话，支持全部 Pi Provider（Anthropic / OpenAI / DeepSeek / 智谱 / Groq 等 30+）。
- **SKILL 动态加载**：自动扫描工作目录及自定义目录下的 `SKILL.md` 技能包（如 `phonak-target-control`），可在技能库面板启用/停用，输入 `/` 触发技能命令。
- **Codex 式对话体验**：流式回复、思考块折叠、工具执行卡片、转向/追问队列、上下文用量与费用统计。
- **精简任务输入区**：工作区入口、模型与思考深度胶囊、可点击上下文用量环、Windows 系统语音输入（`Win+H`）以及统一的发送/停止控制。
- **会话与客户导航**：会话自动持久化（Pi SessionManager），侧边栏按客户线索归组，支持搜索、重命名、删除和归档，并提供本地操作员菜单。
- **设计系统**：高端医疗科技风 —— Cormorant Garamond + Inter 双字形，黑白灰 + 陶土红（#D94632），以中性胶囊、柔和圆角和克制动效构成 Codex 式桌面界面，支持 `prefers-reduced-motion`。

## 开发

```bash
npm install
npm run dev        # electron-vite 开发模式（HMR）
```

## 构建与运行

```bash
npm run build      # 打包 main / preload / renderer 到 out/
npm start          # electron-vite preview（运行已构建产物）
```

## UI 冒烟测试

```bash
npm run build
node scripts/smoke.mjs   # Playwright 驱动已构建应用，覆盖菜单/面板/搜索且不会发送模型请求
```

## 配置

- 首次使用：右下角 **Settings → 模型提供方**，为任一 Provider 填入 API Key，然后在输入框的 Model 选择器中切换模型。
- 工作目录：Agent 的文件与命令均相对该目录执行；目录内的 `SKILL.md` 子目录会被自动发现（默认为本项目的上级目录，即 `FAI/`）。
- 设置持久化在 `%APPDATA%/compass/compass-settings.json`；API Key 存于 Pi 的 `~/.pi/` 认证存储。

## 目录结构

```
src/
  main/       Electron 主进程：Pi AgentService、技能发现、设置
  preload/    contextBridge 暴露类型化 IPC（window.compass）
  renderer/   React UI：设计系统、Hero、对话流、技能/设置面板
  shared/     主进程与渲染层共享的 IPC 类型契约
scripts/
  smoke.mjs   Playwright UI 冒烟测试
```
