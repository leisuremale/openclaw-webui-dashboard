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
from datetime import datetime
from typing import Any

from .helpers import AGENTS_DIR, default_emoji, load_agent_identities

logger = logging.getLogger(__name__)

TOOLS_CONFIG = [
    {"type": "claude-code", "name": "Claude Code", "binary": "claude"},
    {"type": "codex", "name": "Codex", "binary": "codex"},
]


# Tool status cache. check_tools() is called from a polled endpoint (10s),
# so we cache for several minutes — versions don't change between polls and
# spawning subprocesses every cycle is wasteful at best, dangerous at worst.
_TOOLS_CACHE: dict[str, Any] = {"at": 0.0, "value": None}
_TOOLS_TTL_SECONDS = 300.0

# Whole-status cache (tools + tasks + history + today_stats). Even with
# check_tools() cached, get_collab_tasks() still walks every agent's
# sessions.json on each call. Front-end polls every 10s, so a 3s cache
# means at most one fs-walk per ~3s but consecutive page-opens within
# that window are instant.
_STATUS_CACHE: dict[str, Any] = {"at": 0.0, "value": None}
_STATUS_TTL_SECONDS = 3.0


def _check_auth_evidence(tool_type: str) -> bool:
    """Best-effort check that a tool *might* be authed, without invoking it.

    We deliberately do NOT shell out to the binary to verify auth — running
    a CLI agent with --dangerously-skip-permissions from a polled status
    endpoint is unsafe (DOS, API-quota burn, bypasses the tool's own
    permission model). Instead we look for filesystem / env evidence of a
    configured credential. False positives are fine: a real call later will
    return its own auth error and the UI will surface that.
    """
    if tool_type == "claude-code":
        # Anthropic-style env vars, or the standard credential file.
        if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
            return True
        candidates = [
            os.path.expanduser("~/.claude/.credentials.json"),
            os.path.expanduser("~/.claude/credentials.json"),
            os.path.expanduser("~/.config/claude/credentials.json"),
        ]
        return any(os.path.exists(p) for p in candidates)
    if tool_type == "codex":
        if os.environ.get("OPENAI_API_KEY") or os.environ.get("CODEX_API_KEY"):
            return True
        candidates = [
            os.path.expanduser("~/.codex/credentials.json"),
            os.path.expanduser("~/.config/codex/credentials.json"),
        ]
        return any(os.path.exists(p) for p in candidates)
    return False


def check_tools() -> list[dict]:
    """Check installed tools and (heuristic) auth status. Cached for 5 min."""
    now = time.time()
    cached = _TOOLS_CACHE["value"]
    if cached is not None and (now - _TOOLS_CACHE["at"]) < _TOOLS_TTL_SECONDS:
        return cached  # type: ignore[return-value]

    tools = []
    for cfg in TOOLS_CONFIG:
        binary_path = shutil.which(cfg["binary"])
        installed = binary_path is not None
        version = None

        if installed:
            try:
                # 2s is plenty for a `--version` print; node CLI startup is
                # typically 0.5-1.5s. If it takes longer something is wrong
                # and we'd rather show "installed" than block the request.
                result = subprocess.run(
                    [cfg["binary"], "--version"],
                    capture_output=True, text=True, timeout=2,
                )
                if result.stdout.strip():
                    version = result.stdout.strip().split("\n")[0]
            except Exception as e:
                logger.warning("%s --version failed: %s", cfg["binary"], e)

        auth_ok = installed and _check_auth_evidence(cfg["type"])

        tools.append({
            "type": cfg["type"],
            "name": cfg["name"],
            "installed": installed,
            "version": version,
            "authOk": auth_ok,
        })

    _TOOLS_CACHE["value"] = tools
    _TOOLS_CACHE["at"] = now
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
    agent_names = load_agent_identities()

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
                "emoji": default_emoji(spawn_agent_id),
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
    """Aggregate today's call stats by tool type.

    "Today" uses the server's local-day boundary, matching
    OpenclawService.get_overview()'s cutoff. Previously this used UTC
    midnight, so for non-UTC servers the overview "today's Cron runs" and
    the collab "today's calls" disagreed on which day a borderline
    event belonged to.
    """
    today_local = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_ms = int(today_local.timestamp() * 1000)

    stats: dict[str, dict] = defaultdict(lambda: {"calls": 0, "success": 0, "failed": 0})
    for t in tasks:
        ms = t.get("startedAtMs") or 0
        if ms <= 0:
            continue
        if ms >= today_start_ms:
            tt = t["toolType"]
            stats[tt]["calls"] += 1
            if t["status"] == "done":
                stats[tt]["success"] += 1
            elif t["status"] in ("failed", "error"):
                stats[tt]["failed"] += 1
    return dict(stats)


def get_collab_status():
    """Full collab status endpoint. 3s whole-response cache."""
    now = time.time()
    cached = _STATUS_CACHE["value"]
    if cached is not None and (now - _STATUS_CACHE["at"]) < _STATUS_TTL_SECONDS:
        return cached

    tools = check_tools()
    all_tasks = get_collab_tasks()

    active = [t for t in all_tasks if t["status"] == "running"]
    finished = [t for t in all_tasks if t["status"] != "running"]

    payload = {
        "tools": tools,
        "activeTasks": active,
        "todayStats": get_today_stats(all_tasks),
        "history": finished[:50],  # last 50 completed/failed
    }
    _STATUS_CACHE["value"] = payload
    _STATUS_CACHE["at"] = now
    return payload


def prewarm() -> None:
    """Warm `check_tools()` so the first user request doesn't pay the
    subprocess `--version` cost. Called from a background thread at app
    startup (see app/main.py).
    """
    try:
        check_tools()
    except Exception as e:
        logger.warning("collab prewarm failed: %s", e)
