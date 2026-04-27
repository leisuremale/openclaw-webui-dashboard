# Openclaw Dashboard

本地监控面板，替代原版 WebUI。

## 访问

开机自启动已配置，直接打开：

```
http://localhost:5173
```

或终端执行：
```bash
ocdash
```

## 管理命令

| 操作 | 命令 |
|------|------|
| 查看日志 | `tail -f ~/.openclaw/dashboard/logs/stderr.log` |
| 重启服务 | `launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard` |
| 停止自启 | `launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist` |
| 重新启用 | `launchctl load ~/Library/LaunchAgents/com.openclaw.dashboard.plist` |

## 开发模式（前后端分离）

后端：
```bash
cd backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 18790 --reload
```

前端：
```bash
cd frontend
npm run dev
```

## 技术栈

- **后端**：FastAPI + Python 3.9
- **前端**：React 18 + TypeScript + Vite + Tailwind CSS
- **数据**：直接读取 `~/.openclaw/openclaw.json`、`cron/*.json`、扫描 `workspace-*/skills/`
