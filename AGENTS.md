# Moros 新会话入口

开始实质工作前：

1. 阅读 [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) 的“60 秒快速理解”和与任务相关的章节。
2. 检查仓库根、当前分支、`git status --short` 与 `moros/vendor/pi` 子模块状态。
3. 以当前代码、`moros/package.json`、锁文件、gitlink 和 CI 为事实来源。

仓库保护规则：

- 保留用户已有 dirty/untracked 内容；不要 reset、clean 或顺手修改旁支问题。
- `moros/vendor/pi` 是 Git 子模块，不直接编辑；更新时只移动父仓库 gitlink，并确认子模块内部干净。
- `node_modules`、`out`、coverage、smoke 产物和临时截图不是产品源码。
- 不输出 API key、token、会话内容、凭据文件或个人绝对路径。
- Provider live/strict-live、发布/上传、合并、远端历史覆盖和用户数据删除需要明确授权。
- 先定位真实依赖边界，再删除或重构；不要只隐藏 UI 留下废弃后端契约。

Moros 命令都在 `moros/` 运行。推荐 Node 24；当前 Pi 至少要求 Node `>=22.19.0`，部分依赖要求更高版本。

```powershell
git submodule update --init --recursive
Set-Location moros
npm ci
npm run typecheck
npm run test:unit
npm run audit:providers:static
npm run build
```

默认 Provider audit 会访问外部端点；`audit:providers:static` 不访问。`--live` / `strict-live` 会发真实模型请求并可能计费，未经明确授权不要运行。
