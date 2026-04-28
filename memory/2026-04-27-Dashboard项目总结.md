# OpenClaw Web Dashboard — 项目总结

> 创建日期：2026-04-27  
> GitHub: <https://github.com/leisuremale/OpenClaw-Web-Dashboard>  
> 路径：`~/.openclaw/dashboard/`

---

## 一、项目概述

一个本地面板，用于监控和管理 OpenClaw 多 Agent 系统。替代原版 WebUI，提供 Agent 状态、会话监控、Skills 管理、Cron 任务、模型用量、日志分析等功能。

**访问方式**：`http://localhost:5173` 或终端执行 `ocdash`。通过 `launchctl` 开机自启。

---

## 二、技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI (Python 3.9) |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| CSS | Tailwind CSS |
| 图标 | Lucide React |
| 数据来源 | 直接读取 `~/.openclaw/openclaw.json`、`cron/*.json`、`agents/*/sessions/*.jsonl`、`workspace-*/skills/` 等文件系统数据 |
| 部署 | 双 uvicorn 进程 (端口 18790 API + 5173 静态前端)，launchctl 管理 |

---

## 三、项目结构

```
dashboard/
├── README.md
├── MEMORY.md                          # 开发记录（按日期）
├── .gitignore
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                    # FastAPI 入口，CORS + 静态文件服务 + NoCache
│   │   ├── routers/overview.py        # 所有 API 路由 (~15 个端点)
│   │   └── services/openclaw.py       # 核心服务层 (~1200 行，所有数据聚合逻辑)
│   ├── scripts/
│   │   ├── refresh_minimax.py         # Playwright 自动登录抓取 Minimax 用量
│   │   └── refresh_deepseek.py        # DeepSeek 用量（已放弃）
│   └── data/                          # 运行时数据（.gitignore 排除）
│       ├── model_usage.json
│       ├── version_history.json
│       └── playwright_profile/        # 浏览器自动化 profile
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── App.tsx                    # 路由入口
│   │   ├── main.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                 # API 客户端（15 个方法）
│   │   │   └── utils.ts               # 工具函数
│   │   └── components/
│   │       ├── Layout.tsx             # 侧栏导航 + 布局
│   │       ├── Overview.tsx           # 总览页（Agent 卡片 + 版本信息）
│   │       ├── ActiveSessions.tsx     # 活跃会话监控
│   │       ├── CronTimeline.tsx       # Cron 任务时间线
│   │       ├── SkillsPage.tsx         # Skills 管理
│   │       ├── ModelsPage.tsx         # 模型用量
│   │       ├── LogViewer.tsx          # 日志查看 + 智能分析
│   │       ├── AgentDetail.tsx        # Agent 详情页
│   │       ├── AgentMetricsChart.tsx  # SVG 性能图表
│   │       └── AgentsComparisonModal.tsx  # 多 Agent 对比
│   └── dist/                          # 生产构建（.gitignore 排除）
└── logs/                              # 运行时日志（.gitignore 排除）
```

---

## 四、功能页面一览

侧栏导航（6 个页面）：**总览 → 会话 → Cron 任务 → Skills → 模型 → 日志**

### 1. 总览 (`Overview`)
- Agent 状态卡片：工作中/在线/空闲/异常，15 分钟窗口判断
- 点击 Agent 卡片进入 `AgentDetail`
- 版本横幅：当前版本号 + commit，最新版本检查
- 点击版本弹出"升级历史"模态框（时间线 + 多源融合去重）
- Agent 对比模态框（7 天分组柱状图，所有 Agent 并列）

### 2. 活跃会话 (`ActiveSessions`)
- 实时展示所有活跃会话（15 分钟内）
- 区分**用户会话**（显示渠道图标：webchat/feishu/cli）和 **Cron 会话**（琥珀色标记）
- 每 10 秒自动刷新
- 显示：Agent 名、最后活跃时间、持续时长、模型、渠道
- 等待 AI 回复动画（三圆点弹跳）
- 数据来源：`agents/{id}/sessions/sessions.json`

### 3. Cron 任务 (`CronTimeline`)
- 显示所有 Agent 的定时任务配置
- 按 Agent 分组折叠
- 显示 cron 表达式、技能、描述、下次执行时间

### 4. Skills (`SkillsPage`)
- 按 Agent 分组展示所有 Skills
- 显示描述、触发关键词、最后更新时间
- 数据来源：`workspace-*/skills/SKILL.md`（YAML frontmatter 解析）+ `skills/README.md`（Markdown 表格解析）
- 支持 5 种 README 格式自动适配
- 去重机制：Agent 内置 skill 优先于 workspace skill

### 5. 模型 (`ModelsPage`)
- 模型列表：模型名、provider、状态
- Minimax 用量概览（Playwright 自动登录抓取，密码存 Keychain）
- 支持手动刷新用量数据

### 6. 日志 (`LogViewer`)
- 实时日志流（stdout/stderr）
- **智能分析面板**：自动识别卡住的 session、LLM 超时、错误/警告、HTTP 4xx/5xx
- 统计标签 + 逐条洞察卡片
- 每 10 秒自动刷新

### Agent 详情页 (`AgentDetail`)
- 从总览页点击 Agent 进入
- 显示该 Agent 的 Cron 任务列表、ChatType 配置
- **7 天性能图表**（SVG 零依赖）：消息量（柱）+ Token 用量（柱）+ 响应时间（折线）
- 数据来源：扫描 `agents/{id}/sessions/` 下所有 `*.jsonl` 和 `*.jsonl.reset.*` 文件

---

## 五、后端 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/overview` | 总览数据（Agent 列表 + 统计 + 版本信息） |
| GET | `/api/agents` | 所有 Agent 列表 |
| GET | `/api/agents/metrics` | 所有 Agent 近 7 天性能汇总 |
| GET | `/api/agents/{id}/metrics` | 单个 Agent 每日性能数据 |
| GET | `/api/cron` | 所有 Cron 任务 |
| GET | `/api/skills/{agent_id}` | 某个 Agent 的所有 Skills |
| GET | `/api/sessions/active` | 活跃会话列表 |
| GET | `/api/models` | 模型信息 |
| GET | `/api/models/usage` | 缓存模型用量数据 |
| POST | `/api/models/usage/refresh/{provider}` | 刷新模型用量 |
| GET | `/api/logs/analysis` | 日志智能分析 |
| GET | `/api/logs/{log_type}` | 日志内容（stdout/stderr） |
| GET | `/api/version` | 当前版本信息 |
| GET | `/api/version/history` | 版本升级历史 |
| GET | `/api/open-path` | 在 Finder 中打开路径 |
| GET | `/api/health` | 健康检查 |

---

## 六、核心服务层 (`openclaw.py`)

约 1200 行的 `OpenclawService` 类，关键方法：

- `get_overview()` — 聚合所有 Agent 状态
- `get_agents()` — 解析 `openclaw.json` + session 状态
- `get_active_sessions()` — 扫描所有 Agent 的 `sessions.json`，15 分钟窗口过滤
- `get_cron_jobs()` — 解析 `cron/*.json`
- `get_skills_for_agent()` — YAML 解析 + README.md 表格解析 + 去重
- `get_agent_metrics()` — 扫描 `*.jsonl` 和 `*.jsonl.reset.*`，按天聚合消息/Token/响应时间
- `get_all_agents_metrics()` — 所有 Agent 7 天汇总
- `get_models_info()` — 模型列表
- `get_model_usage()` / `refresh_*_usage()` — 模型用量抓取与缓存
- `get_log_analysis()` — 日志模式识别
- `get_version_info()` — 版本检测与历史

---

## 七、关键设计决策

1. **文件系统直读**：不依赖数据库，直接从 `~/.openclaw/` 文件系统读取数据，保持零配置
2. **双进程部署**：API (18790) + 静态前端 (5173) 分离，便于开发调试
3. **15 分钟活跃窗口**：Agent 状态和会话监控共用 15 分钟阈值
4. **Cron 会话分离**：定时任务不计入 Agent 活跃状态，避免扭曲响应时间统计
5. **智能日志分析**：基于正则模式的日志洞察，无需接入日志系统
6. **多源版本历史**：5 级优先级去重融合（持久化 > 安装目录 > 备份文件名推断）
7. **SVG 图表零依赖**：不引入 Chart.js/ECharts，全部用原生 SVG 实现，保持 bundle 小巧（~88KB gzip）

---

## 八、维护命令

| 操作 | 命令 |
|------|------|
| 查看日志 | `tail -f ~/.openclaw/dashboard/logs/stderr.log` |
| 重启服务 | `launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard` |
| 停止自启 | `launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist` |
| 重新构建前端 | `cd frontend && npm run build` |
| 杀进程重启 | `pkill -f "uvicorn app.main:app" && cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 18790` |

---

## 九、Git 仓库

- **URL**: `https://github.com/leisuremale/OpenClaw-Web-Dashboard`
- **分支**: `main`
- **文件数**: 45 个源文件
- **排除**: `node_modules/`, `dist/`, `backend/data/`, `logs/`, `__pycache__/`
