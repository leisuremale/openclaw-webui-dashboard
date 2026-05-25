# Dashboard 开发记录

> 📋 **项目总结**: [memory/2026-04-27-Dashboard项目总结.md](./memory/2026-04-27-Dashboard项目总结.md)

## 2026-05-25 全面 Code Review + 修复（36 项）

> 触发：协同调度面板上线后，用户反馈 Mac 浏览器闪屏 + CollabPanel 点进去看不到详情。
> 借此机会做一次完整 review，从两个已知 bug 一直清到 Low/nit。
> 工作流：并行 4 个 review agent（Mac 闪屏专项 + Collab bug 专项 + 后端整体 + 前端整体）汇总到主 review，按优先级逐项修。

### 两个已知 Bug

- **Mac 浏览器闪屏（主页 + Cron 页）** — 主因是 `.glass-card` 全站滥用 `backdrop-filter: blur(12px)`，Overview 单页就堆 12+ 个模糊层，Safari/Chromium macOS 滚动到 GPU tile 预算边界回退 CPU 栅格化丢帧。次因是 `animate-in fade-in` 用在被轮询刷新的列表项上，每次 setData 重渲都重放关键帧。第三因是 `transition: all` + `transform: translateY(-1px)` 在 hover 期间合成层重建
- **CollabPanel 点进去看不到详情** — 双因：(1) `api.collab()` catch 分支没 `setLoading(false)`，任何错误（auth/500/Win 上 `security` 二进制缺失）都让骨架屏永久显示；(2) "查看会话" 链接是个 `cursor-pointer` 的 `<span>`，**根本没接 onClick**，设计文档说应该跳 ActiveSessions

### Critical 7 项

1. **Loopback 鉴权可被反向代理一跳绕过** — `request.client.host == 127.0.0.1` 在 nginx/Caddy 后永远为真，README 宣称的 Token 鉴权事实上失效。修：检测到 `X-Forwarded-For`/`X-Real-IP`/`Forwarded`/`X-Forwarded-Host` 头时禁用 loopback bypass，需 `OPENCLAW_DASHBOARD_TRUST_PROXY=1` 显式 opt-in
2. **CORS `*` + `allow_credentials=True` 自相矛盾** — 浏览器会拒绝；启动期检测到 `*` 强制 `allow_credentials=False` 并 warn
3. **`/api/open-path` symlink 检查是死代码** — `os.path.realpath()` 先把链接解析完，再 `os.lstat()` 检查 `S_ISLNK` 永远不为真。修：先做词法绝对路径 + 词法 containment（catches `..`）→ 从 `OPENCLAW_ROOT` 逐层 `lstat` 拒绝任何 symlink → 最后 realpath 二次 containment
4. **Collab `_probe_claude_auth` 危险** — 每 10s 调 `/api/collab/status` 都 spawn 一个跳过权限提示（`--dangerously-skip-permissions`）的 claude 子进程，30s timeout 阻塞 worker，烧 API 额度。删 probe，改用环境变量/凭证文件存在的非侵入式启发；`check_tools()` 整体 5 分钟缓存
5. **Windows 不兼容** — `tail`/`open` 二进制不存在；`env["PATH"] = f"{node_bin_dir}:..."` 用硬编码 `:` 在 Win 上产生畸形 PATH。修：新增 `helpers/log_tail.py`（`deque(f, maxlen=n)` 纯 Python tail）；`open` 改为 `sys.platform` 分支（darwin=`open`/win32=`explorer.exe /select,`/linux=`xdg-open`）；PATH 改用 `os.pathsep`；Windows 上可执行文件检测改为扩展名黑名单
6. **TS 没开 strict** — `tsconfig.app.json` 无 `strict`/`strictNullChecks`/`noImplicitAny`。开 `strict: true`
7. **`api.ts` 全部返回 `any`** — `lib/types.ts` 有类型但从未与 wire 连上。改为泛型 `fetchJson<T>` + 每个 endpoint 标注返回类型

### High 12 项（性能 + 体验）

- 所有轮询组件（Overview/Cron/LogViewer/ActiveSessions/CollabPanel）**共享同一 AbortController** → 慢 tick 跨过下一 tick 不会中断旧请求，乱序响应覆盖正确数据。抽出 `lib/usePolling.ts`：per-tick AbortController + sequence-number 弃旧 + `isFirst` loading flag + 出错时也清 loading
- LogViewer 每 10s 轮询都 `setLoading(true)` → 刷新图标 spin 一闪。usePolling 只在首次时设 loading
- SkillsPage 零 AbortController；导航离开后还在写 state。改为透传 signal
- 模态框（VersionHistoryModal、CronDetailModal）手撸 div，无 `role="dialog"` / focus trap / ESC / restore-focus。抽出 `components/ModalShell.tsx`
- Overview `todayStart` 用 `useMemo([])` 冻结在 mount 时刻，跨午夜不更新。加 `dayTick` 状态每 60s 自增触发 derive
- Overview.tsx 666 行，抽出 `AgentsStatusBreakdown.tsx`（272 行，用 `React.memo` 包裹），Overview 减到 469 行。15s 轮询不再触发三张 SVG 重渲
- App.tsx `if (selectedAgent) return <Layout page="overview">` 强制把侧栏高亮覆盖成 overview，与实际页面不一致。改为 conditional render，`page` 状态保持
- 后端 `get_agents()` 对每个 Agent 调 `get_skills_for_agent()` 做完整 YAML 解析就为了拿个 count — 10 Agent × 5-10 skills = 50-100 次文件打开。新增 `count_skills_for_agent()` 只做目录 listing
- `get_agent_metrics` 用 `f.readlines()` 一次读完整个 jsonl 进内存，且不按 mtime 过滤（8 天前的 reset/deleted 文件也照读不误）。改为流式 `for line in f` + mtime 预过滤 + 60s 类级缓存
- `refresh_minimax/_deepseek` subprocess 在 HTTP 请求线程里同步等 2 分钟，Playwright headless=False 还可能弹真窗。改为 `_start_refresh_job()` 后台 daemon 线程 + 类级状态表 + 5min per-provider 速率限制；新增 `/api/models/usage/refresh/{provider}/status` 端点；前端 `refreshUsage` 改为发起 + 2s 间隔轮询 status
- `_check_latest_version` 每次调用都 spawn daemon 线程，无锁无 in-flight 标记。加 `_NPM_REFRESH_INFLIGHT` flag + lock，并发陈旧请求共享同一线程
- collab.py 用 UTC 午夜，overview 用本地午夜 — 跨午夜数据对不上。统一为本地午夜

### Medium 9 项（代码组织 + 跨端点一致性）

- 删 `AgentsComparisonModal.tsx`（335 行死文件，零 import）；package.json 删 `@radix-ui/react-tabs`/`react-collapsible`/`react-tooltip`/`date-fns`（零 import）；`requirements.txt` 删 `aiofiles==24.1.0` 和 `python-multipart==0.0.17`（零 import）
- 6 处组件内重复定义的 interface 合并到 `lib/types.ts`：`ActiveSession` / `LogInsight` / `LogAnalysis` / `LogsResponse` / `ModelInfo` / `ProviderInfo` / `UsageInfo` / `ModelUsage` / `OkResponse`；`Page` 联合类型从 App.tsx 和 Layout.tsx 两处定义合并
- 抽出 `lib/agent-colors.ts`（AGENT_COLORS + `agentColor()`）；`lib/utils.ts` 加 `formatCount` 和 `compareSemver`
- Overview 字符串版本比较 `"2.10.0" > "2.9.0"` 错误 → 改用 `compareSemver`
- AgentDetail 内联 SVG `<Globe>` → lucide-react `<Globe>`；Layout 头部时钟从 mount 即冻结 → 60s 自更新
- `helpers/agents.py` 新增 `AGENTS_DIR` / `OPENCLAW_CONFIG_PATH` / `default_emoji()` / `load_agent_identities()`；collab.py 不再重复定义这些
- 路由 path param 改 `Literal["minimax", "deepseek"]` / `Literal["stdout", "stderr"]`，非法值自动 422
- NoCache 启发式 `"." not in path` 改为只看最后一段（`/foo.json` 不再被误当 SPA 路由）
- 所有 `os.listdir()` 包 try/except 落 logger.warning（涉及 6 处），权限错误不再 500
- `_read_json` 区分 FileNotFoundError（DEBUG）与 JSONDecodeError（WARNING）
- `refresh_minimax.py` 整段 try/finally 保证 tmp_profile（含 cookies/Login Data 副本）必清理；`refresh_deepseek.py` `input()` 加 `sys.stdin.isatty()` 判断，非 TTY 改为最长 2 分钟轮询 URL（被后台 spawn 时不再卡死）
- collab.py `startedAtMs == 0` OverflowError 兜底

### Low/nit 6 项

- `openclaw.py` 8 处方法内 `import re/subprocess/threading/urllib/sys/stat/datetime` 全部提到模块顶；`stat_mod` 别名删；`import time as _time` 删；duplicate `from datetime import datetime, timedelta` 局部 import 删；未用的 `_parse_yaml_frontmatter` import 删
- KPI 基线为 0 不再显示 "+0%" → "较昨日 —"
- CronTimeline 70+ 行行内 `<tr>` 抽成 `<CronRow />`
- LogViewer `highlightLine` 子串匹配 → 单词边界正则（"verror" 不再误染 error），顺手调整优先级（stuck session 和 timeout 排在通用 error 之前）

### 新增文件

- `frontend/src/lib/usePolling.ts` — 统一轮询 hook
- `frontend/src/lib/agent-colors.ts` — 集中色板
- `frontend/src/components/ModalShell.tsx` — 可访问性模态壳
- `frontend/src/components/AgentsStatusBreakdown.tsx` — 拆出来的 7 天对比图
- `backend/app/services/helpers/log_tail.py` — 跨平台 tail

### 验证

```
frontend  npx tsc -b              EXIT=0  (strict mode)
frontend  npx eslint src          EXIT=0  (0 warnings)
frontend  npx vite build          EXIT=0  (317 KB / 91 KB gzip)
backend   py_compile (13 files)   EXIT=0
```

### 关键决策

- **不删 AGENT_NAME_MAP 硬编码中文名**：openclaw.json 里 agent 的 `name` 字段已是英文 id，需要这层 map 才能在 UI 显示"小叮当"等中文别名。保留并在 `load_agent_identities()` 里作为 fallback
- **`OPENCLAW_DASHBOARD_TRUST_PROXY` 默认关**：宁可"反向代理后跑 dashboard 必须给 token"也不要"loopback 鉴权被 X-Forwarded-For 静默绕过"
- **collab "认证就绪" 改为启发式而非真探测**：原 `_probe_claude_auth()` 跑 `--dangerously-skip-permissions` 风险远大于"显示一个偶尔为 false-positive 的就绪绿灯"。真要不要 auth 该工具自己用的时候会报错，UI 这层就别越权
- **refresh 改为 fire-and-forget**：HTTP 不再持有 2 分钟阻塞，前端轮询 status；rate-limit 5min/provider 防 spam
- **不动 `AgentsComparisonModal` 之外的"功能完整但当前未挂载"代码**：用户原 review 没指出要删，保持保守

## 2026-05-24 会话

### 协同调度面板（Collab Panel）— 全新功能

**设计**：
- 需求：Le 要求 Dashboard 可视化 OpenClaw → Claude Code / Codex 的任务调度状态
- 初始方案（v1）：以 psutil 进程扫描为主数据源，CTO 评审后否决
- CTO 核心意见：sessions.json（已有 `spawnedBy` 字段）才是真正可靠的数据源，psutil 无法获知发起者/任务描述/完成状态
- 修订方案（v2）：主数据源改为 `agents/*/sessions/sessions.json`，解析 ACP session key（`agent:{target}:acp:{uuid}`），利用 `spawnedBy` 追踪调用关系

**实现**：
- 后端 `services/collab.py`：遍历所有 agent sessions.json，按 ACP runtime 过滤，提取工具状态+任务+历史+今日统计
- 后端 `routers/collab.py`：`GET /api/collab/status`
- 认证探测：`claude -p "ok" --bare` 实际验证，非 `which`
- 前端 `CollabPanel.tsx`：ToolStatusCard（安装+认证）+ ActiveCollabTask（从 ACP sessions）+ 历史时间线
- 导航重命名：`外部Agent` → `协同调度`，图标 `Monitor` → `GitBranch`
- 全部类型/路由/API 从 `external` 更名为 `collab`

**已否决的设计**：
- `psutil` 进程扫描 — 无法获得发起者/任务描述
- `~/.clawdbot/active-tasks.json` 自建注册表 — 与 session store 重复
- PR/CI 自动轮询 — GitHub rate limit 风险

### ACP 链路打通

**配置**：
- `openclaw.json` 新增 ACP 配置：`enabled`、`dispatch.enabled`、`backend=acpx`、`defaultAgent=claude`
- acpx 插件 `permissionMode` 设为 `approve-all`
- Gateway 环境变量注入：创建 `service-env/claude-acp-env.sh`，从 Keychain 读取 `DEEPSEEK_API_KEY`，设置 `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`
- 修改 `ai.openclaw.gateway-env-wrapper.sh` 自动 source 注入脚本

**验证**：
- `sessions_spawn(runtime=acp, agentId=claude)` → 成功，15s 完成
- DeepSeek V4 Pro 通过 Anthropic 兼容 API 正常工作
- 文件读写、命令执行、curl 网络请求均通过
- 限制：大任务（8+ 文件）需拆分派发，后台进程操作不支持

**Claude Code 调用方式**：
- Le 自定义脚本 `~/.claude/switch-model-provider.sh`，别名 `cc-deepseek` / `cc-kimi`
- 通过 Keychain → DeepSeek API key → Anthropic 兼容端点

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
