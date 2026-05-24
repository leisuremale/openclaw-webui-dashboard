"""
Collab service — reads ACP session data from session store.

Primary data source: agents/{target}/sessions/sessions.json
  — sessionKey format: agent:{target}:acp:{uuid}
  — spawnedBy tracks which agent initiated the call
  — label is the task description
  — status: running | done | failed

No psutil, no custom registry. Session store IS the task registry.
"""

import json
import logging
import os
import shutil
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any

logger = logging.getLogger(__name__)

OPENCLAW_ROOT = os.path.expanduser("~/.openclaw")
AGENTS_DIR = os.path.join(OPENCLAW_ROOT, "agents")

TOOLS_CONFIG = [
    {"type": "claude-code", "name": "Claude Code", "binary": "claude"},
    {"type": "codex", "name": "Codex", "binary": "codex"},
]

# Agent ID → display name mapping (from openclaw config)
def _load_agent_names() -> dict[str, dict[str, str]]:
    """Load agent display names and emojis from openclaw.json."""
    try:
        config_path = os.path.join(OPENCLAW_ROOT, "openclaw.json")
        with open(config_path) as f:
            config = json.load(f)
        agents = config.get("agents", {}).get("list", [])
        mapping = {}
        for a in agents:
            aid = a.get("id", "main")
            name = a.get("name", aid)
            identity = a.get("identity", {})
            emoji = identity.get("emoji", "🤖" if aid != "main" else "🎯")
            mapping[aid] = {"name": name, "emoji": emoji}
        return mapping
    except Exception:
        return {}


def _probe_claude_auth() -> bool:
    """Verify Claude Code auth with an actual API call — not just which."""
    try:
        # Get API key from Keychain
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "openclaw",
             "-a", "DEEPSEEK_API_KEY", "-w"],
            capture_output=True, text=True, timeout=5,
        )
        key = result.stdout.strip()
        if not key:
            return False

        env = {
            **os.environ,
            "ANTHROPIC_API_KEY": key,
            "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
        }
        probe = subprocess.run(
            ["claude", "-p", "ok", "--model", "deepseek-v4-pro",
             "--dangerously-skip-permissions", "--bare"],
            env=env, capture_output=True, text=True, timeout=30,
        )
        return probe.returncode == 0
    except Exception as e:
        logger.warning("Claude auth probe failed: %s", e)
        return False


def check_tools() -> list[dict]:
    """Check installed tools and auth status."""
    tools = []
    for cfg in TOOLS_CONFIG:
        binary_path = shutil.which(cfg["binary"])
        installed = binary_path is not None
        version = None
        auth_ok = False

        if installed:
            try:
                result = subprocess.run(
                    [cfg["binary"], "--version"],
                    capture_output=True, text=True, timeout=5,
                )
                version = result.stdout.strip().split("\n")[0] if result.stdout.strip() else None
            except Exception:
                pass

            if cfg["type"] == "claude-code":
                auth_ok = _probe_claude_auth()

        tools.append({
            "type": cfg["type"],
            "name": cfg["name"],
            "installed": installed,
            "version": version,
            "authOk": auth_ok,
        })
    return tools


def _parse_session_key(session_key: str) -> dict[str, str] | None:
    """Parse agent:{target}:acp:{uuid} format."""
    parts = session_key.split(":")
    # Expected: agent:{targetAgentId}:acp:{uuid}
    if len(parts) >= 4 and parts[2] == "acp":
        return {
            "targetAgentId": parts[1],
            "runtime": parts[2],
            "uuid": ":".join(parts[3:]),
        }
    return None


def _parse_spawned_by(spawned_by: str) -> dict[str, str]:
    """Parse agent:{agentId}:{channel}:{...} format to extract agentId."""
    parts = spawned_by.split(":")
    agent_id = parts[1] if len(parts) >= 2 and parts[0] == "agent" else "unknown"
    return {"agentId": agent_id}


def _map_tool_type(target_agent_id: str) -> str:
    """Map ACP target agent ID to tool type."""
    if target_agent_id == "claude":
        return "claude-code"
    if target_agent_id == "codex":
        return "codex"
    return target_agent_id


def get_collab_tasks() -> list[dict]:
    """Scan all agent sessions for ACP tasks."""
    tasks = []
    agent_names = _load_agent_names()

    if not os.path.isdir(AGENTS_DIR):
        return tasks

    for agent_dir in sorted(os.listdir(AGENTS_DIR)):
        sessions_file = os.path.join(AGENTS_DIR, agent_dir, "sessions", "sessions.json")
        if not os.path.isfile(sessions_file):
            continue

        try:
            with open(sessions_file) as f:
                data = json.load(f)
        except Exception:
            continue

        if not isinstance(data, dict):
            continue

        for session_key, session in data.items():
            if not isinstance(session, dict):
                continue

            parsed = _parse_session_key(session_key)
            if not parsed:
                continue

            tool_type = _map_tool_type(parsed["targetAgentId"])

            # Parse spawnedBy
            spawned_by = session.get("spawnedBy", "")
            spawn_info = _parse_spawned_by(spawned_by)
            spawn_agent_id = spawn_info["agentId"]
            spawn_agent = agent_names.get(spawn_agent_id, {
                "name": spawn_agent_id,
                "emoji": "🤖",
            })

            status = session.get("status", "unknown")
            started_at = session.get("sessionStartedAt") or session.get("startedAt") or 0
            updated_at = session.get("updatedAt") or 0
            ended_at = session.get("endedAt") or 0
            runtime_ms = session.get("runtimeMs") or 0

            # Calculate duration
            if status == "running" and started_at:
                duration_ms = int(time.time() * 1000) - started_at
            elif ended_at and started_at:
                duration_ms = ended_at - started_at
            elif runtime_ms:
                duration_ms = runtime_ms
            else:
                duration_ms = 0

            tasks.append({
                "sessionKey": session_key,
                "toolType": tool_type,
                "targetAgentId": parsed["targetAgentId"],
                "spawnedByAgentId": spawn_agent_id,
                "spawnedByAgentName": spawn_agent["name"],
                "spawnedByEmoji": spawn_agent["emoji"],
                "label": session.get("label", "无描述"),
                "taskLabel": session.get("task") or session.get("label", ""),
                "status": status,
                "startedAtMs": started_at,
                "updatedAtMs": updated_at,
                "durationMs": duration_ms,
                "model": session.get("model", ""),
                "lastChannel": session.get("lastChannel", ""),
            })

    # Sort by startedAt descending
    tasks.sort(key=lambda t: t["startedAtMs"], reverse=True)
    return tasks


def get_today_stats(tasks: list[dict]) -> dict[str, dict]:
    """Aggregate today's call stats by tool type."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    stats: dict[str, dict] = defaultdict(lambda: {"calls": 0, "success": 0, "failed": 0})
    for t in tasks:
        started = datetime.fromtimestamp(t["startedAtMs"] / 1000, tz=timezone.utc)
        if started >= today_start:
            tt = t["toolType"]
            stats[tt]["calls"] += 1
            if t["status"] == "done":
                stats[tt]["success"] += 1
            elif t["status"] in ("failed", "error"):
                stats[tt]["failed"] += 1
    return dict(stats)


def get_collab_status():
    """Full collab status endpoint."""
    tools = check_tools()
    all_tasks = get_collab_tasks()

    active = [t for t in all_tasks if t["status"] == "running"]
    finished = [t for t in all_tasks if t["status"] != "running"]

    return {
        "tools": tools,
        "activeTasks": active,
        "todayStats": get_today_stats(all_tasks),
        "history": finished[:50],  # last 50 completed/failed
    }
