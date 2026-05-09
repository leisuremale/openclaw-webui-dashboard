# 在另一台 Mac 上验证（给 Claude Code 的指令）

> 这份文档是写给目标 Mac 上运行的 Claude Code 的。把整个仓库 clone 到那台 Mac，然后让那边的 Claude Code 按下面顺序执行。

## 上下文

仓库：`openclaw-webui-dashboard`，OpenClaw 的本地监控面板。
- 后端：FastAPI（Python 3.10+），数据来自 `~/.openclaw/` 文件系统直读
- 前端：React 19 + Vite 8 + TypeScript，由 FastAPI 在 18790 端口同时托管
- 默认仅接受 loopback 连接；非 loopback 需 `OPENCLAW_DASHBOARD_TOKEN` Bearer

最近一次大改包含：
- 4 个 CRITICAL 安全修复（路径白名单、SPA-API 隔离、loopback 守卫、去硬编码路径）
- 7 个 HIGH 修复（原子写、TOCTOU、后台线程日志、AbortController、错误外显、yaml.safe_load）
- MEDIUM 重构（共享类型、UTC 时区、CORS 环境变量、SVG 共用组件、`openclaw.py` 拆 helpers、`Overview.tsx` 拆子组件）

## 必查环境

```bash
sw_vers              # macOS 版本（任何 macOS 12+ 都行）
python3 --version    # 需要 ≥ 3.10
node --version       # 需要 ≥ 20
npm --version
```

如果缺：
```bash
brew install python@3.11 node@20
```

## 步骤 1：安装

```bash
cd <repo-root>
./install.sh
```

预期：约 1–2 分钟完成。最后打印「Install complete.」横幅。

如果失败：
- `pip install` 卡住 → 网络问题或 PyPI 镜像。重跑 `backend/.venv/bin/pip install -r backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple`
- `npm ci` 报 `lockfileVersion` 不兼容 → 升级 npm 或改用 `npm install`

## 步骤 2：静态校验（必跑，不需要 OpenClaw 运行）

```bash
# 前端：TypeScript 编译 + ESLint
cd frontend
npx tsc -b                     # 期望：无任何输出（成功）
npx eslint src                 # 期望：0 errors / 0 warnings
cd ..

# 后端：所有 py 文件能 import
backend/.venv/bin/python -m py_compile \
  backend/app/main.py \
  backend/app/routers/overview.py \
  backend/app/services/openclaw.py \
  backend/app/services/helpers/*.py \
  backend/scripts/refresh_deepseek.py \
  backend/scripts/refresh_minimax.py
echo "py_compile: $?"          # 期望：0
```

任何一项失败请直接 STOP，把错误粘回来。

## 步骤 3：启动后端，跑健康检查

```bash
backend/.venv/bin/python -m uvicorn app.main:app \
  --app-dir backend \
  --host 127.0.0.1 --port 18790 &
SERVER_PID=$!
sleep 3

# 1. /api/health：loopback 不需要鉴权
curl -fsS http://127.0.0.1:18790/api/health
# 期望：{"status":"ok"}

# 2. 路径白名单生效
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18790/api/logs/notallowed
# 期望：400

# 3. 未匹配 /api/* 不再降级为 SPA
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18790/api/no-such-endpoint
# 期望：404

# 4. SPA 根路径仍可访问（如果 frontend/dist 已构建）
curl -fsS http://127.0.0.1:18790/ | head -1
# 期望：HTML（包含 <!doctype html>）

kill $SERVER_PID
```

## 步骤 4：非 loopback 拒绝（可选，需多机或 Docker）

如果有别的机器在同一网段：

```bash
# 在被验证 Mac 上：
backend/.venv/bin/python -m uvicorn app.main:app \
  --app-dir backend --host 0.0.0.0 --port 18790 &
```

从另一台机器：
```bash
curl -s -w "\n%{http_code}\n" http://<mac-ip>:18790/api/health
# 期望：403 + JSON {"detail": "Dashboard refuses non-loopback access. ..."}
```

设置 token 后再试：
```bash
# 被验证 Mac：
export OPENCLAW_DASHBOARD_TOKEN="testtoken"
# 重启 uvicorn

# 另一台：
curl -H "Authorization: Bearer testtoken" http://<mac-ip>:18790/api/health
# 期望：{"status":"ok"}

curl http://<mac-ip>:18790/api/health
# 期望：401（无 token 头）
```

## 步骤 5：与真实 OpenClaw 联动验证（如果该 Mac 装了 OpenClaw）

确认 `~/.openclaw/openclaw.json` 存在，然后：

```bash
backend/.venv/bin/python -m uvicorn app.main:app \
  --app-dir backend --host 127.0.0.1 --port 18790 &

# 拿真实数据
curl -fsS http://127.0.0.1:18790/api/agents | python3 -m json.tool | head -30
curl -fsS http://127.0.0.1:18790/api/overview | python3 -c "import sys, json; d = json.load(sys.stdin); print('agents:', len(d.get('agents', [])), 'cron:', len(d.get('cronJobs', [])))"
curl -fsS http://127.0.0.1:18790/api/sessions/active | python3 -m json.tool | head -20
```

预期看到非空 agents 数组和合理的 cron/sessions。如果是空，说明 OpenClaw 还没运行过；不算错误，只是无数据。

打开浏览器：<http://127.0.0.1:18790>，应该看到仪表盘。检查：
- 总览页 KPI 卡片渲染
- Agent 卡片可点击进详情页
- 日志页能拉到 stdout/stderr（如果 launchd 在跑）
- 控制台没有 React 报错（特别注意 `set-state-in-effect` / `purity` 这两类）

## 步骤 6：报告回来

把以下信息发回：

```text
sw_vers: <粘 sw_vers 输出>
python3: <版本>
node: <版本>

install.sh: PASS / FAIL
  失败时贴最后 30 行输出

tsc -b: PASS / FAIL
eslint:  0 errors / N warnings — <如果有 N>0，贴下来>
py_compile: PASS / FAIL

curl /api/health: <返回值>
curl /api/logs/notallowed: <HTTP 码>
curl /api/no-such-endpoint: <HTTP 码>
curl /: <第一行>

如果跑了步骤 5：
agents 数量: N
cronJobs 数量: M
浏览器仪表盘截图（仅本地）
React 控制台报错: <无 / 粘错误>
```

## 已知遗留问题（不算 bug）

- `start.sh` 走的是 launchd 路径（`com.openclaw.dashboard`），如果你那边没有注册 launchd 服务，**不要**直接跑 `start.sh`，用步骤 3 的 uvicorn 命令。
- `frontend/src/components/SkillsPage.tsx:33` 路径缩短逻辑硬编码 `/Users/`，仅 macOS。其他系统会回退到「.../最后三段」。
- `MEMORY.md` 是历史决策记录，与最新代码不完全同步——以本 README 为准。

## 不要做的

- 不要 `git push` 或 `git commit` 到 origin（仓库属于 `leisuremale`，需要 fork）
- 不要往 `~/.openclaw/` 里写任何东西，除非用户明确要求
- `OPENCLAW_DASHBOARD_TOKEN` 不要提交到任何 git 仓库

完。
