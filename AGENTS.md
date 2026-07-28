# FAI / Compass 新会话入口

开始实质工作前：

1. 阅读 [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) 的“60 秒快速理解”及与当前任务相关的章节。
2. 检查仓库根、当前分支、`git status --short` 和 Pi 子模块状态。
3. 以当前代码、package/lock、gitlink 和 CI 为事实；提案与 `Compass_intro*.html` 只说明历史愿景。

仓库保护规则：

- 保留用户已有 dirty/untracked 内容；不要 reset、clean 或顺手修改旁支问题。
- `compass/vendor/pi` 是 Git 子模块，不直接编辑；更新时只移动父仓库 gitlink，并确认子模块内部干净。
- `node_modules`、`out`、`dist`、`smoke-out`、`target-bottom-tabs` 和根目录 UIA/截图不是产品主源码。
- 不输出 API key、token、客户资料、会话内容、UIA 隐私或个人绝对路径。
- Provider live/strict-live、真实验配软件/设备操作、发布/上传、合并和用户数据删除需要明确授权。
- 仓库没有可复现的 Windows Setup 打包流程；不要从本机临时产物或历史聊天补写“官方命令”。

Compass 命令都在 `compass/` 运行。常用安全验证：

```powershell
npm run typecheck
npm run test:unit
npm run audit:providers:static
npm run build
```

默认 Provider audit 会访问外部端点；`--live` / `strict-live` 会发真实模型请求并可能计费。完整架构、数据位置、修改矩阵、排障和已知风险见 [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)。
