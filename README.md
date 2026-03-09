# MoRos

MoRos 是一个 local-first 的桌面任务 Agent 项目，目标是把传统聊天界面升级为可执行的工作流入口，覆盖更真实的桌面工作场景。

当前仓库基于 `pi-mono` 工程基础持续演进，但本次开源的主体是 **MoRos**，核心代码与产品实现位于 `packages/Moros`。

- 仓库地址：<https://github.com/JiangYain/MoRos>
- 开源主体：`packages/Moros`
- 许可证：`packages/Moros/LICENSE`（MoRos Community Source License 1.0, MCSL-1.0）

## 快速开始

### 环境要求

- Node.js >= 20
- npm >= 9

### 安装

```bash
git clone https://github.com/JiangYain/MoRos.git
cd MoRos
cd packages/Moros
npm install
```

### 本地开发

```bash
npm run dev
```

启动后默认地址：

- 前端：`http://localhost:53210`
- API：`http://localhost:53211/api`

本地数据目录：`packages/Moros/markov-data/`

## 构建与打包

在 `packages/Moros` 目录执行：

```bash
npm run build          # Web + Server 构建
npm run electron-dev   # 桌面开发调试
npm run dist           # 生成安装包（electron-builder）
```

## 贡献指南

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。  
如果使用 AI Agent 参与开发，请同时遵循 [AGENTS.md](AGENTS.md) 的约束。

## 与 pi-mono 的关系

本项目沿用了 `pi-mono` 的部分工程结构与技术资产，并在此基础上聚焦于 MoRos 产品能力。  
对外开源叙事与维护范围以 MoRos 为主。

## License

本仓库以 `packages/Moros/LICENSE` 为准。
