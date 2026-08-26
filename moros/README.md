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

## 验证

```powershell
npm run typecheck
npm run test:unit
npm run audit:providers:static
npm run build
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
