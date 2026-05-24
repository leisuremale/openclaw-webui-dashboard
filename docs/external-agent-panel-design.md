# 协同调度面板设计方案 v2

> CTO 评审后修订。核心变更：以 session store 为主数据源，砍掉 psutil 进程扫描 + 自建 registry，
> Phase 1/2 优先级对调。

---

## 一、目标

在 Dashboard 新增「协同调度」Tab，可视化 OpenClaw ACP 调用外部 Agent（Claude Code / Codex）的任务状态。

核心数据源：`agents/*/sessions/sessions.json`（已有 `spawnedBy` 字段追踪调用关系）。

---

## 二、页面布局

```
┌──────────────────────────────────────────────────────────┐
│ 🔀 协同调度                                    Claude Code│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌── 工具状态 ──────────────────────────────────────┐    │
│  │  ┌─────────────┐  ┌─────────────┐                │    │
│  │  │ 🟢 Claude    │  │ ⚪ Codex     │                │    │
│  │  │   Code       │  │   未安装     │                │    │
│  │  │ v2.1.150     │  │             │                │    │
│  │  │ 认证: ✅      │  │ npm install │                │    │
│  │  │ 今日 3次调用  │  │             │                │    │
│  │  └─────────────┘  └─────────────┘                │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌── 活跃任务 ──────────────────────────────────────┐    │
│  │                                                   │    │
│  │  ┌───────────────────────────────┐               │    │
│  │  │ 🔵 运行中 · Claude Code        │               │    │
│  │  │ 📋 写脚本+运行+验证            │               │    │
│  │  │ 👤 发起: 小智 (xiao-zhi)       │               │    │
│  │  │ ⏱ 运行 17s                    │               │    │
│  │  │ [查看会话]                     │               │    │
│  │  └───────────────────────────────┘               │    │
│  │                                                   │    │
│  │  ┌───────────────────────────────┐               │    │
│  │  │ 🟢 已完成 · Claude Code        │               │    │
│  │  │ 📋 Create /tmp/acp_test.txt   │               │    │
│  │  │ 👤 发起: 小智 (xiao-zhi)       │               │    │
│  │  │ ⏱ 用时 15s                    │               │    │
│  │  │ [查看会话]                     │               │    │
│  │  └───────────────────────────────┘               │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌── 今日统计 ──────────────────────────────────────┐    │
│  │  Claude Code: ████████░░ 5次 · 4成功 · 1失败      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌── 调用历史 (最近7天) ────────────────────────────┐    │
│  │  时间线（时间 · 发起Agent · 工具 · 任务 · 结果）    │    │
│  │  05-24 12:54  小智 → Claude Code  写文件测试 ✅   │    │
│  │  05-24 11:49  小智 → Claude Code  Dashboard面板   │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## 三、数据模型

### 3.1 主数据源：sessions.json

`sessions.json` 中 ACP 类型 session 的关键字段：

```json
{
  "sessionKey": "agent:claude:acp:a8eabf92-...",
  "agentId": "xiao-zhi",
  "runtime": "acp",
  "targetAgentId": "claude",
  "spawnedBy": "agent:xiao-zhi:webchat:...",
  "label": "Say hello...",
  "status": "running|done|error",
  "startedAt": 1716537600000,
  "updatedAt": 1716537800000,
  "model": "deepseek-v4-pro"
}
```

**关键字段解析：**
- `sessionKey`：`agent:{target}:acp:{uuid}` → 直接提取 target agent ID
- `spawnedBy`：父 session key → 谁调用了这个 ACP 任务
- `agentId`：发起 Agent ID
- `label`：任务描述
- `status`：running / done / error
- `startedAt` / `updatedAt`：时间范围

### 3.2 前端类型定义

```typescript
// lib/types.ts 新增

interface CollabTool {
  type: 'claude-code' | 'codex';
  name: string;
  installed: boolean;
  version?: string;
  authOk: boolean;
}

interface CollabTask {
  sessionKey: string;
  toolType: 'claude-code' | 'codex';
  targetAgentId: string;
  spawnedByAgentId: string;     // 发起者 Agent ID
  spawnedByAgentName: string;   // 发起者显示名
  spawnedByEmoji: string;       // 发起者 emoji
  label: string;                // 任务描述
  status: 'running' | 'done' | 'error';
  startedAtMs: number;
  updatedAtMs: number;
  durationMs: number;
  model?: string;
}

interface CollabResponse {
  tools: CollabTool[];
  activeTasks: CollabTask[];
  todayStats: Record<string, { calls: number; success: number; failed: number }>;
  history: CollabTask[];
}
```

---

## 四、后端 API 设计

### 4.1 API 端点

```
GET /api/collab/status
# 返回: { tools, activeTasks, todayStats, history }

GET /api/collab/tools
# 返回: { claudeCode: { installed, version, authOk }, codex: { installed, version } }
# authOk: 实际探测验证，不是 which
```

### 4.2 数据采集逻辑（`services/collab.py`）

```python
def get_collab_status():
    """收集协同调度状态"""
    
    # 1. 工具检测（安装 + 认证探测）
    tools = _check_tools()
    #  claude --version 验证安装，echo 'test' | claude -p "ok" --model xxx 验证认证
    #  which codex 检查安装
    
    # 2. 遍历所有 Agent 的 sessions.json
    tasks = []
    for agent_dir in glob("agents/*"):
        sessions_file = f"{agent_dir}/sessions/sessions.json"
        for session in _read_sessions(sessions_file):
            if session.get("runtime") == "acp":
                tasks.append(_parse_acp_session(session))
    
    # 3. 分流
    active = [t for t in tasks if t.status == "running"]
    history = [t for t in tasks if t.status != "running"]
    
    # 4. 聚合今日统计（按日期 bucket）
    today_stats = _aggregate_today_stats(tasks)
    
    return { "tools": tools, "activeTasks": active, "todayStats": today_stats, "history": history[-50:] }
```

### 4.3 认证探测逻辑

```python
def _probe_claude_auth():
    """用实际命令验证认证——不是 which"""
    key = security("find-generic-password", "-s", "openclaw", "-a", "DEEPSEEK_API_KEY", "-w")
    if not key: return False
    env = {**os.environ, "ANTHROPIC_API_KEY": key, "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic"}
    result = subprocess.run(
        ["claude", "-p", "ok", "--model", "deepseek-v4-pro", "--dangerously-skip-permissions"],
        env=env, capture_output=True, text=True, timeout=30
    )
    return result.returncode == 0
```

---

## 五、前端组件设计

### 页面结构

```
CollabPanel.tsx              ← 主页面
├── ToolStatusCard.tsx       ← 工具状态（安装+认证）
├── ActiveCollabTask.tsx     ← 活跃任务卡片
├── TodayStats.tsx           ← 今日统计
└── TaskTimeline.tsx         ← 历史时间线
```

### 交互

- **任务卡片 → [查看会话]**：跳转到「会话」页面，定位该 session
- **PR/CI 按钮**：手动触发（点击后调 `gh pr view`），不自动轮询避免 rate limit

---

## 六、实施计划（修订后）

### Phase 1（核心，2h）
1. 后端 `services/collab.py`：遍历 `agents/*/sessions/sessions.json`，解析 ACP sessions
2. 后端 `routers/collab.py`：`GET /api/collab/status`
3. 前端 `CollabPanel.tsx`：ToolStatusCard + ActiveCollabTask
4. 导航注册（`Layout.tsx` + `App.tsx`）

### Phase 2（可选，1h）
1. 任务卡片点击 → ActiveSessions 定位
2. 历史时间线组件

### Phase 3（暂缓）
- PR/CI 集成（手动触发按钮，非轮询）
- 工作树/分支信息

---

## 七、命名变更

| 旧名 | 新名 |
|------|------|
| `external` | `collab` |
| `ExternalAgents` | `CollabPanel` |
| `ExternalAgentResponse` | `CollabResponse` |
| `ExternalTool` | `CollabTool` |
| `ExternalTask` | `CollabTask` |
| `/api/external-agents/status` | `/api/collab/status` |
| 导航 label `外部Agent` | `协同调度` |

---

## 八、数据源优先级

```
主数据源（Phase 1）：sessions.json
  ├── sessionKey 提取 target agent
  ├── spawnedBy 追踪调用关系
  ├── status 判断 running/done/error
  └── label 作为任务描述

辅助数据源（Phase 1）：which + 认证探测
  └── 判断工具安装状态和认证有效性

不做（已否决）：
  ├── psutil 进程扫描 — 无法获知发起者/任务描述/完成状态
  ├── ~/.clawdbot/active-tasks.json — 与 session store 重复
  └── PR/CI 自动轮询 — GitHub rate limit 风险
```

---

## 九、与现有页面的关系

```
Dashboard 页面地图：

总览           — KPI + Agent 状态卡片
├── 点击 Agent → AgentDetail
├── 协同调度     — 🔜 OpenClaw → Claude Code / Codex 调度面板
会话           — 活跃会话（用户 + Cron）
│   └── 协同调度任务卡片 → 跳转到此页查看详情
Cron          — 定时任务时间线
Skills        — 技能管理
模型           — 模型 Provider + 用量
日志           — 实时日志 + 异常检测
```

---

*文档版本: v2.0 · CTO 评审修订 · 更新日期: 2026-05-24*
