# OpenClaw Web Dashboard

> 🌐 专为 [OpenClaw](https://github.com/leisuremale/OpenClaw) 打造的本地监控面板，全面替代原版 WebUI。

本地运行的智能仪表盘，实时监控 Agent 状态、Cron 任务、模型用量、系统日志，提供深度数据洞察与历史趋势分析。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/fastapi-0.115-green.svg)](https://fastapi.tiangolo.com/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind-3.x-38bdf8.svg)](https://tailwindcss.com/)

---

## 📸 预览

### 总览仪表盘
![Dashboard Overview](screenshots/overview.png)

> 💡 更多页面截图请参见下方 [功能介绍](#-功能介绍) 章节。

---

## ✨ 功能亮点

### 📊 总览页（Overview）
- **四大 KPI 卡片**：今日消息总数、今日 Token 量、今日 Cron 成功/失败数，带较昨日涨跌对比
- **Agent 状态总览**：工作中 / 在线 / 空闲 / 故障 实时统计，点击展开性能对比模态框
- **Agent 对比图表**：7 天横向分组柱状图，多 Agent 并列对比消息量 / Token / 响应时间
- **版本信息横幅**：显示当前安装版本、commit 哈希、更新检查，一键查看历史升级记录

### ⏱ Cron 时间线
- 所有 Cron 任务的执行历史时间线视图
- 区分成功/失败状态，展示最近执行时间与结果
- 快速查阅每个定时任务的健康状况

### 🤖 Agent 详情
- 点击任意 Agent 进入详情页，查看关联 Cron 任务与技能列表
- **7 天性能趋势图**：纯 SVG 无依赖图表，消息量 / Token 用量 / 响应时间三指标
- 状态实时检测（基于 15 分钟窗口的文件时间戳）

### 🧠 Skills 技能管理
- 自动扫描所有 `workspace-*/skills/` 目录，发现并展示各 Agent 绑定技能
- 列表/卡片两种视图，技能描述一目了然

### 📡 模型管理
- 列出所有已配置的模型 Provider 及模型列表
- **用量概览**：MiniMax 自动抓取用量数据（百分比进度条 + 已用/总额配比）
- 支持手动刷新模型用量数据

### 📜 日志查看
- 实时查看 Dashboard 服务的 stdout / stderr 日志
- **智能日志洞察**：自动识别卡住 Session、LLM 超时、错误/警告模式
- 每 10 秒自动刷新，统计标签 + 逐条洞察卡片

### 🔄 Active Sessions（活跃会话）
- 跨 Agent 查看所有 15 分钟内活跃的会话
- 区分用户会话与 Cron 会话
- 展示会话 ID、Agent 信息、最后活跃时间

### 🔔 版本检查
- 实时查询 npm registry 获取最新 OpenClaw 版本
- 后台异步线程刷新，6 小时缓存，请求不阻塞页面
- **升级历史时间线**：多源融合（plugin-runtime-deps + backup 文件名 + 本地版本），精确定位安装时刻

---

## 🚀 快速开始

### 访问（生产模式）

开机自启动已配置，直接浏览器打开：

```
http://localhost:5173
```

或终端执行快捷命令：

```bash
ocdash
```

### 开发模式（前后端分离）

后端（API 服务，端口 18790）：
```bash
cd backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 18790 --reload
```

前端（Vite 开发服务器，端口 5173，自动代理 API）：
```bash
cd frontend
npm run dev
```

### 构建生产版本

```bash
cd frontend && npm run build
```

构建产物位于 `frontend/dist/`，后端会自动将其作为静态文件提供服务。

---

## 🛠 管理命令

| 操作 | 命令 |
|------|------|
| 查看日志 | `tail -f ~/.openclaw/dashboard/logs/stderr.log` |
| 重启服务 | `launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard` |
| 停止自启动 | `launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist` |
| 重新启用自启动 | `launchctl load ~/Library/LaunchAgents/com.openclaw.dashboard.plist` |
| 查看 API 文档 | 开发模式下打开 `http://localhost:18790/docs` |

---

## 📡 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/overview` | 总览数据（KPI + Agent 状态 + 版本信息） |
| `GET` | `/api/agents` | 所有 Agent 列表 |
| `GET` | `/api/agents/metrics` | 所有 Agent 7 天性能数据汇总 |
| `GET` | `/api/agents/{id}/metrics` | 指定 Agent 每日消息/Token/响应时间 |
| `GET` | `/api/cron` | Cron 任务列表及执行历史 |
| `GET` | `/api/skills/{agent_id}` | 指定 Agent 的技能列表 |
| `GET` | `/api/models` | 模型 Provider 和模型信息 |
| `GET` | `/api/models/usage` | 缓存的模型用量数据 |
| `POST`| `/api/models/usage/refresh/{provider}` | 刷新指定 Provider 用量 |
| `GET` | `/api/sessions/active` | 所有活跃会话（15 分钟窗口） |
| `GET` | `/api/logs/{stdout\|stderr}` | 查看 Dashboard 日志 |
| `GET` | `/api/logs/analysis` | 日志智能分析洞察 |
| `GET` | `/api/version` | 当前版本信息 + 更新检查 |
| `GET` | `/api/version/history` | 版本升级历史记录 |
| `GET` | `/api/open-path` | 在 Finder 中打开指定路径 |

---

## 🧱 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **后端框架** | FastAPI 0.115 | 高性能异步 Python Web 框架 |
| **前端框架** | React 19 + TypeScript 5 | 声明式 UI 与类型安全 |
| **构建工具** | Vite 8 | 极速 HMR 开发体验 |
| **样式方案** | Tailwind CSS 3 | 原子化 CSS，暗色主题适配 |
| **图标** | Lucide React | 现代开源图标库 |
| **UI 组件** | Radix UI | 无障碍原语（Tabs / Tooltip / Collapsible） |
| **日期处理** | date-fns | 轻量级日期格式化 |
| **后端服务器** | Uvicorn | ASGI 高性能服务器 |
| **数据源** | 文件系统直读 | 零数据库依赖，直接从 `~/.openclaw/` 读取 |

---

## 📁 项目结构

```
dashboard/
├── README.md                   # 本文件
├── MEMORY.md                   # 开发历程与决策记录
├── screenshots/                # 截图（用于文档）
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI 应用入口 + 静态文件服务
│   │   ├── routers/
│   │   │   └── overview.py     # 全部 API 路由定义
│   │   ├── services/
│   │   │   └── openclaw.py     # 核心业务逻辑（数据采集、指标计算）
│   │   └── models/             # Pydantic 数据模型
│   ├── data/                   # 持久化数据（版本历史、用量缓存）
│   ├── scripts/                # 辅助脚本（MiniMax 刷新等）
│   └── requirements.txt        # Python 依赖
└── frontend/
    ├── src/
    │   ├── App.tsx             # 应用入口 + 页面路由
    │   ├── components/
    │   │   ├── Layout.tsx      # 全局布局（侧边栏 + 内容区）
    │   │   ├── Overview.tsx    # 总览仪表盘
    │   │   ├── CronTimeline.tsx# Cron 时间线
    │   │   ├── AgentDetail.tsx # Agent 详情页
    │   │   ├── AgentMetricsChart.tsx  # 纯 SVG 性能图表
    │   │   ├── AgentsComparisonModal.tsx # Agent 横向对比
    │   │   ├── SkillsPage.tsx  # 技能管理
    │   │   ├── ModelsPage.tsx  # 模型管理
    │   │   ├── LogViewer.tsx   # 日志查看
    │   │   └── ActiveSessions.tsx # 活跃会话
    │   ├── assets/             # 静态资源
    │   ├── lib/                # 工具函数与 API 客户端
    │   ├── index.css           # 全局样式 + Tailwind
    │   └── main.tsx            # React 入口
    ├── index.html              # HTML 模板
    ├── vite.config.ts          # Vite 配置（含 API 代理）
    ├── tailwind.config.js      # Tailwind 配置
    └── package.json            # 前端依赖
```

---

## 🧪 设计哲学

- **零数据库**：所有数据实时读取文件系统，无额外存储依赖
- **轻量优先**：无 jQuery、ECharts 等大型库；图表使用纯 SVG，组件使用 Radix 原语
- **暗色风格**：全局暗色主题，减轻长时间监控的视觉疲劳
- **容错设计**：API 逐个降级，单点故障不阻塞整页渲染
- **零阻塞**：后台线程异步刷新数据（版本检查、用量抓取），不影响前端响应

---

## 📄 License

MIT © [leisuremale](https://github.com/leisuremale)
