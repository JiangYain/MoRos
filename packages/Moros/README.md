# MoRos

一个简单的备忘录，让注意力具有 MoRos Property，让思考和行动只关注有限的上下文，消除循环依赖，使因果关系和解析流程始终保持清晰；

人类太脆弱太不完美，我的短时记忆似乎不超过128K，找个记事本来增加一下自己的上下文长度顺带稳定一下自己的注意力机制

## 使用 CLI 部署

### Claude Code / Cursor / 其他 LLM CLI

帮我安装和部署这个项目
```

## 古法命令行方法

### 安装

```bash
git clone <你的仓库地址>
cd Moros
npm install
```

### 启动

开发模式（前端 + 后端同时启动）：

```bash
npm run dev
```

前端：`http://localhost:53210`
API:`http://localhost:53211/api`

数据存储于本地 `./markov-data/`

### 构建

```bash
npm run build
```

### 打包桌面应用

开发调试：

```bash
npm run electron-dev
```

生成安装包：

```bash
npm run dist
```

## 许可证

[PolyForm Noncommercial 1.0.0](LICENSE)
