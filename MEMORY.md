# Dashboard 开发记录

> 📋 **项目总结**: [memory/2026-04-27-Dashboard项目总结.md](./memory/2026-04-27-Dashboard项目总结.md)

## 2026-04-28 会话

### 首页 KPI 卡片重构
- 左侧菜单栏：`Cron 任务` → `Cron`
- 四大 KPI 卡片文案调整：
  1. `Agent 总数` → `今日消息总数`，小字 `较昨日 ±X%`（绿涨红跌）
  2. `Cron 健康度` → `今日Token量`，小字 `较昨日 ±X%`（绿涨红跌）
  3. `今日成功` → `今日Cron成功`，小字 `X cron 任务运行中`
  4. `今日失败` → `今日Cron失败`
- Agent 状态总览小字改为 `共X个Agent · X个工作中 · X个在线 · X个空闲 · X个故障`
- 消息/Token 数据来自 `api.agentsMetrics()` 当日汇总，比较基数为昨日数据
- 故障数 = warning + error 状态 Agent 合计

### 版本检查 - npm registry 实时查询
- **问题**：原来只读本地 `~/.openclaw/update-check.json` 缓存，缓存中 `lastNotifiedVersion` 长期未更新导致一直显示"已是最新"
- **解决**：后端新增 `_check_latest_version()` 方法，向 `registry.npmjs.org/openclaw/latest` 实时查询
- **性能设计（零影响）**：
  - 首次请求直接返回本地缓存（< 1ms），后台 daemon 线程异步刷新
  - 缓存周期 6 小时，npm 请求超时 15s
  - 网络失败自动回退到旧缓存，绝不阻塞 dashboard 响应
  - 当前安装 2026.4.23 → 最新 2026.4.26，前端正确显示"有新版本"

## 2026-04-27 会话（续）

### Bug 修复：AgentDetail 加载卡住
- **根因**：后端新增 `/api/agents/{agent_id}/metrics` 路由后，launchctl 管理的 dashboard 服务未自动重启，导致请求 404；前端 `Promise.all` 无错误处理，`setLoading(false)` 永不执行
- **修复**：
  1. 重启 dashboard 服务 `launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard`
  2. 前端 `useEffect` 改用 `.catch` + `.finally`，确保 loading 必定结束
  3. `api.agentMetrics` 单独 `.catch` 降级返回空数据，避免阻塞整页
  4. 新增 error 状态 UI，失败时显示错误信息和返回按钮

### 总览页 Agent 状态总览 + 性能对比（横向分组柱状图）
- **对比视图重构**：从纵向 Agent 卡片列表改为 **横向时间轴分组柱状图**
  - 横向 7 天日期轴，每天一个分组（140px 宽）
  - 每天组内所有 Agent **并列细柱**，颜色区分（10 个 Agent 专属色）
  - 柱高 = 消息量（全局归一化，跨天可比较）
  - 柱内白色叠加条 = Token 用量
  - 柱顶圆点大小 = 响应时间长短
  - 鼠标悬停显示详细数据，点击柱进入该 Agent 每日趋势详情
- **图例交互**：顶部图例可点击 toggle 显示/隐藏任意 Agent，便于聚焦对比
- 模态框加宽至 `max-w-6xl`，图表区域支持横向滚动

### 总览页 Agent 状态总览 + 性能对比
- 总览页 Agent 状态 Grid 上方新增可点击横幅"Agent 状态总览"
  - 显示工作中/在线/空闲/异常的数量摘要
  - 点击打开 `AgentsComparisonModal` 模态框
- `AgentsComparisonModal`：
  - 调用 `/api/agents/metrics` 获取所有 Agent 近 7 天数据
  - 列表视图：每个 Agent 一行，横向条形图对比消息量（靛蓝）和 Token 用量（翠绿）
  - 显示平均响应时间（琥珀色）
  - 点击单个 Agent 进入该 Agent 的每日趋势详情（复用 `AgentMetricsChart`）
  - ESC / 返回按钮 / 点击空白处关闭

### AgentDetail 性能图表（7 天 + 三指标分离）
- 从 30 天改为 **7 天**
- 图表改为 **分组双柱 + 折线**：
  - 左柱（靛蓝）= 消息量，右柱（翠绿）= Token 用量
  - 琥珀色圆点 + 虚线 = 响应时间趋势
  - 底部图例同步更新

### AgentDetail 性能图表（历史数据增强）
- **问题**：最初只能显示今天数据，因为只读取 `sessions.json` 中引用的当前 session 文件
- **根因**：旧 session 被 OpenClaw 重命名为 `*.jsonl.reset.<timestamp>`，仍在磁盘上但未被扫描
- **修复**：`get_agent_metrics` 现在扫描 `agents/{agent_id}/sessions/` 目录下所有 `*.jsonl` 和 `*.jsonl.reset.*` 文件，跳过 `*.trajectory.jsonl*`（不同格式）
- **效果**：main agent 恢复出 4/25（63 条消息）、4/26（160 条消息）、4/27（4 条消息）共 3 天历史数据

### AgentDetail 性能图表
- 后端新增 `get_agent_metrics(agent_id)` 方法：
  - 读取 `agents/{agent_id}/sessions/sessions.json` 及关联 jsonl 文件
  - 跳过 `:cron:` session（避免定时任务扭曲响应时间）
  - 提取 assistant 消息的 timestamp + usage.totalTokens
  - 响应时间 = assistant.ts − 前一条 user/toolResult.ts，过滤 > 10 分钟异常值
  - 按天聚合，返回最近 30 天数据（含 messages、tokens、avgResponseTimeMs）
- 新增 `/api/agents/{agent_id}/metrics` 端点
- 前端新增 `AgentMetricsChart` 组件（纯 SVG，零依赖）：
  - 靛蓝柱状图 = 消息量，翠绿内柱 = Token 用量
  - 顶部汇总：总消息数、总 Tokens（k 单位）、平均响应时间
  - 空数据时显示"近 30 天内无对话数据"
  - 鼠标悬停显示日期详情（SVG title）
- `AgentDetail` 页集成图表，放在右侧列 Cron 任务上方

## 2026-04-27 会话

### 总览页 - 版本信息
- 总览页新增 Openclaw 版本展示横幅
- 后端 `get_version_info()` 方法：
  - 通过 `openclaw --version` 获取版本号和 commit（带 Node PATH 兼容 launchd）
  - 回退方案：直接读取 `package.json` 的 version 字段
  - 读取二进制/包的 mtime 作为更新时间
  - 读取 `update-check.json` 获取最新可更新版本
- 前端显示版本号、commit 短哈希、更新时间
- 版本比较：若 `latestNotified > installed` 显示"有新版本"琥珀色标签，否则显示"已是最新"绿色标签
- 新增 `/api/version` 独立端点，同时版本信息也包含在 `/api/overview` 响应中

### 总览页 - 版本升级历史
- 横幅可点击，弹出"Openclaw 升级历史"模态框（ESC / 点空白处 / X 按钮关闭）
- 后端新增 `/api/version/history` 端点，多源融合 + rank 优先级去重：
  - rank 5: `backend/data/version_history.json` 持久化（最高优先级）
  - rank 4: `~/.openclaw/plugin-runtime-deps/openclaw-<version>-<hash>/` 目录 birth 时间（精确到分钟，对应实际安装时刻）
  - rank 3: 当前生效版本（package.json mtime）
  - rank 2: `~/.openclaw/archive/openclaw-json-backups/openclaw.json.backup-YYYY.M.DD` 文件名 + mtime（推断值）
- 持久化策略：仅持久化 rank ≥ 3 的高置信度记录，避免 backup-filename 推断值锁死后续更精确的来源
- 前端模态框 UI：
  - 时间线（左侧贯穿渐变线 + 节点圆点）
  - 当前版本：靛蓝色高亮 + 脉动动画 + "当前版本" 徽章
  - 来源徽章：精确（绿）/ 推断（琥珀），鼠标悬停显示来源说明
  - 每条显示：版本号（mono）、安装时间（mono）、相对时间（今天 / 昨天 / N 天前 / N 月前 / N 年前）
  - footer 图例 + 总记录数
- 实测：5 条历史 (2026.4.15 / .21 / .22 / .24 / .23)，2026.4.24 安装时刻精确到 23:00（plugin-runtime-deps），其余从备份文件名推断

### 杂项修复
- 修复 ModelsPage.tsx `quota_calls` 可能为 undefined 的 TS 报错
- 清理 LogViewer.tsx 中未使用的 `useMemo` / `stuckAgentIds` 变量

## 2026-04-26 会话

### Agent 状态检测
- 改为文件系统方式读取 `~/.openclaw/agents/{agent_id}/sessions/sessions.json`
- 15分钟窗口判断活跃状态，15分钟内 `updatedAt` 有更新即为"工作中"
- 排除 `:cron:` 开头的 session key（定时任务不算活跃）
- 同步修复了 agent 详情页的状态显示（之前始终显示"空闲"）

### 模型页新增用量概览
- 新增"用量概览"区域，展示各 provider 的用量数据
- **Minimax**：通过 Playwright 自动登录抓取（密码存 Keychain）
  - 显示 plan 名、配额、已使用百分比、进度条
  - 支持手动点击刷新
  - 后端脚本：`backend/scripts/refresh_minimax.py`
- **DeepSeek**：尝试抓取但放弃（登录有验证码，cookie 解密过于复杂）

### 日志页面智能分析
- 新增 `/api/logs/analysis` 端点，自动分析 dashboard + gateway 日志
- 识别模式：
  - 卡住的 session（排除 cron）
  - LLM 超时/自动压缩
  - 错误、警告、重启事件
  - HTTP 4xx/5xx
- 前端新增可折叠"日志洞察"面板：
  - 统计标签（卡住次数、错误数、警告数等）
  - 逐条洞察卡片（agent 名、卡住时长、时间戳）
  - 每 10 秒自动刷新

### 其他改动
- 前端新增 NoCacheMiddleware 防止浏览器缓存旧版本
- `backend/data/model_usage.json` 缓存模型用量数据
- API client 新增 `modelUsage()`, `refreshUsage()`, `logAnalysis()` 方法
