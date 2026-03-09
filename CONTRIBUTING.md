# Contributing to MoRos

感谢你为 MoRos 做出贡献。

本仓库基于 `pi-mono` 演进，但开源主体是 **MoRos**，请优先将改动聚焦在 `packages/Moros`，并确保贡献内容与 MoRos 的产品方向一致。

## 核心原则

**你必须理解自己提交的代码。**  
如果你无法清晰解释改动的目的、实现方式、影响范围与边界条件，PR 可能会被关闭。

可以使用 AI 工具辅助开发，但你需要对最终提交负责，并自行完成验证。

## 提交前沟通

首次贡献或较大改动，请先创建 Issue，说明以下内容：

1. 你要解决什么问题
2. 为什么现在要做
3. 计划如何实现（简明即可）

维护者确认方向后再提交 PR，可以显著减少返工。

## 本地开发

从仓库根目录进入 MoRos 包：

```bash
cd packages/Moros
npm install
```

常用命令：

```bash
npm run dev           # 前端 + 后端开发
npm run build         # 构建
npm run electron-dev  # 桌面调试
npm run dist          # 打包安装程序
```

## PR 提交要求

- PR 应聚焦单一目标，避免把无关改动混在一起
- 提交说明请写清楚：背景、方案、影响范围、验证方式
- 如改动行为、接口或配置，请同步更新相关文档（至少包括 `README.md`）
- 不要提交密钥、令牌、隐私数据或本地环境文件

## 关于 AI Agent

如果你使用 AI Agent，请从仓库根目录运行，使其读取并遵循 `AGENTS.md` 规则。

## License 与贡献授权

本项目许可证为 `packages/Moros/LICENSE`（MCSL-1.0）。  
提交 PR 即表示你确认有权提交该内容，并同意你的贡献在本项目中按该许可证进行分发。

## 讨论与反馈

请通过 Issue 发起讨论：<https://github.com/JiangYain/MoRos/issues>
