import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from .helpers import (
    AGENT_NAME_MAP,
    AGENT_ORDER,
    OPENCLAW_ROOT,
    _atomic_write_json,
    _cron_to_human,
    _extract_skill_info,
    _parse_skills_readme,
    _parse_yaml_frontmatter,
)

logger = logging.getLogger(__name__)



class OpenclawService:
    def __init__(self):
        self.config_path = os.path.join(OPENCLAW_ROOT, "openclaw.json")
        self.cron_jobs_path = os.path.join(OPENCLAW_ROOT, "cron", "jobs.json")
        self.cron_state_path = os.path.join(OPENCLAW_ROOT, "cron", "jobs-state.json")
    
    def _read_json(self, path: str) -> Optional[dict]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Failed to read JSON %s: %s", path, e)
            return None
    
    def get_config(self) -> dict:
        return self._read_json(self.config_path) or {}
    
    def get_agents(self) -> list[dict]:
        config = self.get_config()
        agents = config.get("agents", {})
        defaults = agents.get("defaults", {})
        agent_list = agents.get("list", [])
        result = []
        for agent in agent_list:
            enriched = {**defaults}
            if "model" in agent:
                enriched["model"] = agent["model"]
            enriched.update(agent)
            # Resolve model string
            model_info = self._resolve_model(enriched.get("model"))
            enriched["_model_display"] = model_info.get("name", str(enriched.get("model")))
            enriched["_provider"] = model_info.get("provider", "unknown")
            # Display name mapping
            aid = enriched.get("id", "main")
            enriched["_displayName"] = AGENT_NAME_MAP.get(aid, enriched.get("name", aid))
            result.append(enriched)
        # Custom order
        order_index = {aid: idx for idx, aid in enumerate(AGENT_ORDER)}
        result.sort(key=lambda a: order_index.get(a.get("id", "main"), 999))

        # Enrich with status, cron stats, and skills count (same as overview)
        cron_jobs = self.get_cron_jobs()
        active_agents = self._get_active_agents()
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000

        # Agent cron map
        agent_cron_map: dict[str, dict] = {}
        for job in cron_jobs:
            aid = job["agentId"]
            if aid not in agent_cron_map:
                agent_cron_map[aid] = {"total": 0, "ok": 0, "error": 0}
            agent_cron_map[aid]["total"] += 1
            if job["lastStatus"] == "ok":
                agent_cron_map[aid]["ok"] += 1
            elif job["lastStatus"] == "error":
                agent_cron_map[aid]["error"] += 1

        for agent in result:
            aid = agent.get("id", "main")
            stats = agent_cron_map.get(aid, {"total": 0, "ok": 0, "error": 0})
            agent["_cron_stats"] = stats
            agent["_skills_count"] = len(self.get_skills_for_agent(aid, agent.get("workspace")))

            agent_jobs = [j for j in cron_jobs if j["agentId"] == aid]
            recent_errors = [j for j in agent_jobs if j["lastStatus"] == "error" and (j.get("lastRunAtMs") or 0) >= today_start]

            if aid in active_agents:
                agent["_status"] = "working"
            elif recent_errors and len(recent_errors) == len(agent_jobs):
                agent["_status"] = "error"
            elif recent_errors:
                agent["_status"] = "warning"
            elif not agent_jobs:
                agent["_status"] = "idle"
            else:
                agent["_status"] = "online"

        return result
    
    def _resolve_model(self, model_ref: Any) -> dict:
        config = self.get_config()
        providers = config.get("models", {}).get("providers", {})
        
        primary = None
        if isinstance(model_ref, str):
            primary = model_ref
        elif isinstance(model_ref, dict):
            primary = model_ref.get("primary")
        
        if not primary:
            return {"name": "default", "provider": "unknown"}
        
        provider_name, model_id = primary.split("/", 1) if "/" in primary else ("unknown", primary)
        provider = providers.get(provider_name, {})
        for m in provider.get("models", []):
            if m.get("id") == model_id:
                return {
                    "name": m.get("name", model_id),
                    "provider": provider_name,
                    "baseUrl": provider.get("baseUrl"),
                    "contextWindow": m.get("contextWindow"),
                }
        return {"name": model_id, "provider": provider_name}
    
    def get_cron_jobs(self) -> list[dict]:
        jobs_def = self._read_json(self.cron_jobs_path) or {"jobs": []}
        jobs_state = self._read_json(self.cron_state_path) or {"jobs": {}}
        
        jobs = []
        for job in jobs_def.get("jobs", []):
            job_id = job.get("id")
            state = jobs_state.get("jobs", {}).get(job_id, {})
            # Parse schedule
            schedule = job.get("schedule", {})
            time_str = ""
            schedule_display = ""
            if schedule.get("kind") == "cron":
                time_str = schedule.get("expr", "")
                schedule_display = _cron_to_human(time_str)
            elif schedule.get("kind") == "every":
                every_ms = schedule.get("everyMs", 0)
                minutes = every_ms // 1000 // 60
                if minutes >= 60:
                    hours = minutes // 60
                    mins_remainder = minutes % 60
                    if mins_remainder:
                        time_str = f"every {hours}h {mins_remainder}m"
                        schedule_display = f"每 {hours} 小时 {mins_remainder} 分钟"
                    else:
                        time_str = f"every {hours}h"
                        schedule_display = f"每 {hours} 小时"
                else:
                    time_str = f"every {minutes}m"
                    schedule_display = f"每 {minutes} 分钟"
            
            # Status
            last_status = state.get("state", {}).get("lastRunStatus", "unknown")
            consecutive_errors = state.get("state", {}).get("consecutiveErrors", 0)
            
            jobs.append({
                "id": job_id,
                "agentId": job.get("agentId", "main"),
                "name": job.get("name", "Unnamed"),
                "description": job.get("description", ""),
                "enabled": job.get("enabled", True),
                "schedule": time_str,
                "scheduleDisplay": schedule_display,
                "scheduleKind": schedule.get("kind"),
                "nextRunAtMs": state.get("state", {}).get("nextRunAtMs"),
                "lastRunAtMs": state.get("state", {}).get("lastRunAtMs"),
                "lastStatus": last_status,
                "consecutiveErrors": consecutive_errors,
                "lastError": state.get("state", {}).get("lastError", ""),
                "lastDurationMs": state.get("state", {}).get("lastDurationMs", 0),
            })
        return jobs
    
    def open_path(self, path: str) -> dict:
        import stat as stat_mod
        import subprocess
        import urllib.parse

        decoded = urllib.parse.unquote(path)
        real = os.path.realpath(decoded)
        if not os.path.exists(real):
            return {"ok": False, "error": "Path does not exist"}

        root = os.path.realpath(OPENCLAW_ROOT)
        try:
            if os.path.commonpath([real, root]) != root:
                return {"ok": False, "error": "Path outside openclaw root"}
        except ValueError:
            return {"ok": False, "error": "Path outside openclaw root"}

        try:
            st = os.lstat(real)
        except OSError as e:
            return {"ok": False, "error": str(e)}

        mode = st.st_mode
        if stat_mod.S_ISLNK(mode):
            return {"ok": False, "error": "Symlinks not permitted"}
        is_dir = stat_mod.S_ISDIR(mode)
        is_file = stat_mod.S_ISREG(mode)
        if not (is_dir or is_file):
            return {"ok": False, "error": "Only regular files or directories allowed"}
        # Refuse executables / .app bundles (macOS treats these as launchable).
        exec_bits = stat_mod.S_IXUSR | stat_mod.S_IXGRP | stat_mod.S_IXOTH
        if is_file and (mode & exec_bits):
            return {"ok": False, "error": "Executable files not permitted"}
        if real.endswith(".app") or real.endswith(".app/"):
            return {"ok": False, "error": ".app bundles not permitted"}

        # Files: reveal in Finder (-R) instead of launching.
        # Directories: open the folder.
        argv = ["open", real] if is_dir else ["open", "-R", real]
        try:
            subprocess.run(argv, check=True, timeout=5)
            return {"ok": True, "path": real}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def get_logs(self, log_type: str, lines: int = 200) -> dict:
        import subprocess
        log_dir = os.path.join(os.path.dirname(__file__), "../../../logs")
        log_file = os.path.join(log_dir, f"{log_type}.log")
        if not os.path.exists(log_file):
            return {"lines": [], "error": f"Log file not found: {log_type}.log"}

        try:
            result = subprocess.run(
                ["tail", "-n", str(lines), log_file],
                capture_output=True, text=True, timeout=5
            )
            return {
                "lines": result.stdout.strip().split("\n") if result.stdout.strip() else [],
                "path": log_file,
            }
        except Exception as e:
            return {"lines": [], "error": str(e)}

    def get_log_analysis(self, lines: int = 500) -> dict:
        """Analyze dashboard + gateway logs and return structured insights."""
        import re
        import subprocess
        from collections import Counter

        all_lines = []
        sources_ok = []

        # Read dashboard logs
        for log_type in ["stdout", "stderr"]:
            log_dir = os.path.join(os.path.dirname(__file__), "../../../logs")
            log_file = os.path.join(log_dir, f"{log_type}.log")
            if os.path.exists(log_file):
                try:
                    result = subprocess.run(
                        ["tail", "-n", str(lines), log_file],
                        capture_output=True, text=True, timeout=5
                    )
                    for line in result.stdout.strip().split("\n"):
                        if line.strip():
                            all_lines.append(("dashboard", line))
                    sources_ok.append(f"dashboard/{log_type}")
                except Exception:
                    pass

        # Read gateway logs
        gateway_log_dir = os.path.expanduser("~/.openclaw/logs")
        for log_name in ["gateway.err.log", "gateway.out.log"]:
            log_file = os.path.join(gateway_log_dir, log_name)
            if os.path.exists(log_file):
                try:
                    result = subprocess.run(
                        ["tail", "-n", str(lines), log_file],
                        capture_output=True, text=True, timeout=5
                    )
                    for line in result.stdout.strip().split("\n"):
                        if line.strip():
                            all_lines.append(("gateway", line))
                    sources_ok.append(f"gateway/{log_name}")
                except Exception:
                    pass

        if not all_lines:
            return {"insights": [], "stats": {}, "sources": []}

        # Analysis pipeline
        stats: dict[str, int] = Counter()
        insights: list[dict] = []

        # Timestamp extraction pattern
        ts_pattern = re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})')

        # Group lines by topics
        stuck_sessions: dict[str, list] = {}  # agent_id -> lines

        for source, line in all_lines:
            lower = line.lower()

            # 1. Stuck sessions (skip cron sessions)
            if "[diagnostic] stuck session" in lower:
                # Skip cron sessions — they're expected to run long
                if ":cron:" in line:
                    continue
                stats["stuck_sessions"] = stats.get("stuck_sessions", 0) + 1
                # Extract agent name
                m = re.search(r'sessionKey=agent:(\S+?):', line)
                agent_id = m.group(1) if m else "unknown"
                m_age = re.search(r'age=(\d+)s', line)
                age = int(m_age.group(1)) if m_age else 0
                if agent_id not in stuck_sessions:
                    stuck_sessions[agent_id] = []
                stuck_sessions[agent_id].append({"line": line, "age": age})

            # 2. Timeout / compaction
            if "timeout-compaction" in lower or "llm timed out" in lower:
                stats["llm_timeouts"] = stats.get("llm_timeouts", 0) + 1
                m_diag = re.search(r'diagId=(\S+)', line)
                diag_id = m_diag.group(1) if m_diag else ""
                insights.append({
                    "type": "timeout",
                    "severity": "warning",
                    "title": "LLM 超时",
                    "detail": f"模型调用超时，已自动压缩重试",
                    "diagId": diag_id,
                    "line": line[:200],
                })

            # 3. Warnings
            if "[warn]" in lower:
                # Skip known uninteresting warnings
                if "no im.chat.access_event" in lower:
                    continue
                stats["warnings"] = stats.get("warnings", 0) + 1
                # Extract the warning message
                m = re.search(r'\[warn\]:\s*\[?\s*(.+?)\s*\]?\s*$', line)
                msg = m.group(1)[:100] if m else line[-120:]
                insights.append({
                    "type": "warning",
                    "severity": "warning",
                    "title": "警告",
                    "detail": msg,
                    "line": line[:200],
                })

            # 4. Errors
            if any(kw in lower for kw in ["error", "exception", "traceback", "fail"]):
                if "[warn]" not in lower and "[diagnostic]" not in lower:
                    stats["errors"] = stats.get("errors", 0) + 1

            # 5. Restart events
            if "restart" in lower or "shutting down" in lower or "started server process" in lower:
                stats["restarts"] = stats.get("restarts", 0) + 1

            # 6. HTTP 4xx/5xx
            http_m = re.search(r'"GET\s+\S+\s+HTTP[^"]*"\s+(\d{3})', line)
            if http_m:
                code = int(http_m.group(1))
                if code >= 400:
                    stats[f"http_{code}"] = stats.get(f"http_{code}", 0) + 1

        # Generate stuck session insights
        for agent_id, entries in stuck_sessions.items():
            if entries:
                max_age = max(e["age"] for e in entries)
                count = len(entries)
                agent_name = AGENT_NAME_MAP.get(agent_id, agent_id)
                recent = entries[-1]
                ts_m = ts_pattern.search(recent["line"])
                ts = ts_m.group(1) if ts_m else ""
                insights.append({
                    "type": "stuck_session",
                    "severity": "error" if max_age > 120 else "warning",
                    "title": f"{agent_name} 会话卡住",
                    "detail": f"检测到 {count} 次卡住，最长 {max_age} 秒",
                    "agentId": agent_id,
                    "agentName": agent_name,
                    "maxAge": max_age,
                    "count": count,
                    "lastSeen": ts,
                    "line": recent["line"][:200],
                })

        # Sort insights by severity
        severity_order = {"error": 0, "warning": 1, "info": 2}
        insights.sort(key=lambda x: severity_order.get(x.get("severity", "info"), 99))

        return {
            "insights": insights,
            "stats": dict(stats),
            "sources": sources_ok,
        }

    def get_models_info(self) -> list[dict]:
        config = self.get_config()
        providers = config.get("models", {}).get("providers", {})
        result = []
        for provider_name, provider in providers.items():
            models = []
            for m in provider.get("models", []):
                models.append({
                    "id": m.get("id", ""),
                    "name": m.get("name", ""),
                    "contextWindow": m.get("contextWindow"),
                })
            result.append({
                "provider": provider_name,
                "baseUrl": provider.get("baseUrl", ""),
                "models": models,
            })
        return result

    def get_skills_for_agent(self, agent_id: str, workspace: Optional[str] = None) -> list[dict]:
        skills = []
        paths_to_scan = []

        # Agent bundled skills
        agent_skill_dir = os.path.join(OPENCLAW_ROOT, "agents", agent_id, "agent", "skills")
        if os.path.exists(agent_skill_dir):
            paths_to_scan.append(("agent", agent_skill_dir))

        # Workspace skills
        if workspace:
            ws_skill_dir = os.path.join(workspace, "skills")
            if os.path.exists(ws_skill_dir):
                paths_to_scan.append(("workspace", ws_skill_dir))
        else:
            # Try workspace-{agent_id} first, then fallback to plain "workspace" for main agent
            ws_skill_dir = os.path.join(OPENCLAW_ROOT, f"workspace-{agent_id}", "skills")
            if os.path.exists(ws_skill_dir):
                paths_to_scan.append(("workspace", ws_skill_dir))
            elif agent_id == "main":
                default_ws = os.path.join(OPENCLAW_ROOT, "workspace", "skills")
                if os.path.exists(default_ws):
                    paths_to_scan.append(("workspace", default_ws))

        for source, base_dir in paths_to_scan:
            # Parse parent README.md for descriptions & trigger keywords
            # Try README.md first, then readme.md (case-insensitive fallback for macOS)
            parent_readme = os.path.join(base_dir, "README.md")
            if not os.path.exists(parent_readme):
                alt_readme = os.path.join(base_dir, "readme.md")
                if os.path.exists(alt_readme):
                    parent_readme = alt_readme
            readme_table: dict[str, dict] = {}
            if os.path.exists(parent_readme):
                readme_table = _parse_skills_readme(parent_readme)

            for entry in os.listdir(base_dir):
                entry_path = os.path.join(base_dir, entry)
                if not os.path.isdir(entry_path):
                    continue
                if entry == "references" or entry.startswith(".") or entry.startswith("_"):
                    continue

                # "Nuwa Skills" is a meta-directory containing more skills
                if entry == "Nuwa Skills":
                    for sub_entry in os.listdir(entry_path):
                        sub_path = os.path.join(entry_path, sub_entry)
                        if os.path.isdir(sub_path):
                            skill = _extract_skill_info(sub_entry, "workspace", sub_path, readme_table)
                            skills.append(skill)
                    continue

                skill = _extract_skill_info(entry, source, entry_path, readme_table)
                skills.append(skill)

        # Deduplicate by name: agent-bundled skill takes priority over workspace copy
        seen: dict[str, dict] = {}
        for skill in skills:
            name = skill["name"]
            if name not in seen:
                seen[name] = skill
            else:
                # Prefer agent-bundled source over workspace
                if skill["source"] == "agent" and seen[name]["source"] != "agent":
                    seen[name] = skill
                # If same source, keep the one with richer description
                elif skill["source"] == seen[name]["source"]:
                    if len(skill.get("description", "")) > len(seen[name].get("description", "")):
                        seen[name] = skill

        return list(seen.values())
    
    def _version_history_path(self) -> str:
        return os.path.join(OPENCLAW_ROOT, "dashboard", "backend", "data", "version_history.json")

    def get_version_history(self) -> dict:
        """Return historical openclaw upgrade records.

        Sources (with priority — higher rank overrides lower for same version):
          rank 5: persisted history file (backend/data/version_history.json) — most authoritative going forward
          rank 4: plugin-runtime-deps/openclaw-<version>-<hash>/ birth time — precise install moment
          rank 3: current version (from package.json mtime)
          rank 2: archive/openclaw-json-backups/openclaw.json.backup-YYYY.M.DD filename + mtime
        """
        import re

        # version -> {version, installedAtMs, source, rank}
        entries: dict[str, dict] = {}

        def _add(version: str, installed_at_ms: int, source: str, rank: int):
            if not version or version == "unknown":
                return
            existing = entries.get(version)
            if existing is None or rank > existing["rank"]:
                entries[version] = {
                    "version": version,
                    "installedAtMs": installed_at_ms,
                    "source": source,
                    "rank": rank,
                }

        # --- rank 2: openclaw.json.backup-<date> filename hints (lowest priority) ---
        date_re = re.compile(r"openclaw\.json\.backup[-.]?(\d{4})[-.]?(\d{1,2})[-.]?(\d{1,2})")
        for backup_dir in [
            os.path.join(OPENCLAW_ROOT, "archive", "openclaw-json-backups"),
            OPENCLAW_ROOT,
        ]:
            if not os.path.isdir(backup_dir):
                continue
            for fn in os.listdir(backup_dir):
                m = date_re.match(fn)
                if not m:
                    continue
                full = os.path.join(backup_dir, fn)
                if not os.path.isfile(full):
                    continue
                try:
                    ts = os.path.getmtime(full)
                except Exception:
                    continue
                year, month, day = m.group(1), int(m.group(2)), int(m.group(3))
                version_guess = f"{year}.{month}.{day}"
                _add(version_guess, int(ts * 1000), "backup-filename", 2)

        # --- rank 4: plugin-runtime-deps (precise install moment) ---
        deps_dir = os.path.join(OPENCLAW_ROOT, "plugin-runtime-deps")
        if os.path.isdir(deps_dir):
            for entry in os.listdir(deps_dir):
                m = re.match(r"^openclaw-([0-9]+\.[0-9]+\.[0-9]+(?:[\-\+\.][0-9A-Za-z\.]+)?)-([0-9a-f]+)$", entry)
                if not m:
                    continue
                version = m.group(1)
                full = os.path.join(deps_dir, entry)
                try:
                    st = os.stat(full)
                    ts = getattr(st, "st_birthtime", None) or st.st_mtime
                    _add(version, int(ts * 1000), "plugin-runtime-deps", 4)
                except Exception:
                    pass

        # --- rank 5: persisted history file (most authoritative) ---
        history_path = self._version_history_path()
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                persisted = json.load(f)
        except Exception:
            persisted = {"entries": []}
        for rec in persisted.get("entries", []):
            v = rec.get("version")
            ts = rec.get("installedAtMs")
            if v and isinstance(ts, (int, float)):
                _add(v, int(ts), rec.get("source", "persisted"), 5)

        # --- rank 3: current version (only fills in if not yet known) ---
        info = self.get_version_info()
        current_version = info.get("version", "")
        current_updated_at = info.get("updatedAt", "")  # already YYYY-MM-DD HH:MM
        if current_version and current_version != "unknown":
            ts_ms = int(time.time() * 1000)
            try:
                ts_ms = int(datetime.strptime(current_updated_at, "%Y-%m-%d %H:%M").timestamp() * 1000)
            except Exception:
                pass
            _add(current_version, ts_ms, "current", 3)

        # --- Persist newly-discovered HIGH-confidence versions (rank >= 3) ---
        # Skip rank 2 (backup-filename) — those are guesses re-derivable each call.
        # Persisting them would lock in less-accurate timestamps via rank 5.
        existing_versions = {rec.get("version") for rec in persisted.get("entries", [])}
        new_records = []
        for v, e in entries.items():
            if v in existing_versions:
                continue
            if e["rank"] < 3:
                continue
            new_records.append({
                "version": v,
                "installedAtMs": e["installedAtMs"],
                "source": e["source"],
                "recordedAtMs": int(time.time() * 1000),
            })
        if new_records:
            persisted_entries = persisted.get("entries", []) + new_records
            try:
                _atomic_write_json(history_path, {"entries": persisted_entries})
            except OSError as e:
                logger.warning("Failed to persist version history %s: %s", history_path, e)

        # --- Format for response: sort by installedAtMs desc, mark current ---
        records = []
        for r in entries.values():
            records.append({
                "version": r["version"],
                "installedAtMs": r["installedAtMs"],
                "installedAt": datetime.fromtimestamp(r["installedAtMs"] / 1000).strftime("%Y-%m-%d %H:%M"),
                "source": r["source"],
                "isCurrent": (r["version"] == current_version),
            })
        records.sort(key=lambda r: r["installedAtMs"], reverse=True)

        return {
            "current": current_version,
            "history": records,
        }

    def _check_latest_version(self) -> Optional[dict]:
        """Check npm registry for the latest openclaw version, with 6h cache.

        Non-blocking: always returns cached data immediately. If cache is
        stale, triggers a background thread to refresh it for next call.

        Returns {"version": str, "checkedAt": iso-str} or None.
        """
        import threading
        import urllib.request
        import urllib.error
        from datetime import datetime, timezone

        update_check_path = os.path.join(OPENCLAW_ROOT, "update-check.json")
        MIN_INTERVAL_SEC = 6 * 3600  # 6 hours

        # Read existing cache
        cached = self._read_json(update_check_path) or {}
        last_checked_str = cached.get("lastCheckedAt", "")

        needs_refresh = True
        if last_checked_str:
            try:
                last_checked_dt = datetime.fromisoformat(last_checked_str.replace("Z", "+00:00"))
                elapsed = (datetime.now(timezone.utc) - last_checked_dt).total_seconds()
                if elapsed < MIN_INTERVAL_SEC:
                    needs_refresh = False
            except Exception:
                pass

        # Always return current cache immediately (non-blocking)
        result = None
        if cached.get("lastNotifiedVersion"):
            result = {
                "version": cached["lastNotifiedVersion"],
                "checkedAt": last_checked_str,
            }

        # If stale, fire background refresh for the next request
        if needs_refresh:
            def _bg_refresh():
                npm_url = "https://registry.npmjs.org/openclaw/latest"
                try:
                    req = urllib.request.Request(
                        npm_url,
                        headers={
                            "Accept": "application/json",
                            "User-Agent": "openclaw-dashboard/1.0",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                    latest = data.get("version", "")
                    if latest:
                        now_iso = datetime.now(timezone.utc).isoformat()
                        _atomic_write_json(update_check_path, {
                            "lastCheckedAt": now_iso,
                            "lastNotifiedVersion": latest,
                            "lastNotifiedTag": "latest",
                        })
                except Exception:
                    logger.exception("npm version refresh failed")

            threading.Thread(target=_bg_refresh, daemon=True).start()

        return result

    def get_version_info(self) -> dict:
        """Get openclaw version and last update time."""
        import subprocess
        import re

        info = {
            "version": "unknown",
            "commit": "",
            "updatedAt": "",
            "latestNotified": "",
        }

        pkg_json = os.path.expanduser(
            "~/.openclaw/tools/node-v22.22.0/lib/node_modules/openclaw/package.json"
        )
        openclaw_bin = os.path.expanduser("~/.openclaw/tools/node-v22.22.0/bin/openclaw")
        node_bin_dir = os.path.expanduser("~/.openclaw/tools/node-v22.22.0/bin")

        # Build PATH that includes node binary so launchd can run it
        env = os.environ.copy()
        if node_bin_dir not in env.get("PATH", ""):
            env["PATH"] = f"{node_bin_dir}:{env.get('PATH', '/usr/bin:/bin')}"

        # Method 1: try openclaw --version (with node in PATH)
        bin_to_try = openclaw_bin if os.path.exists(openclaw_bin) else "openclaw"
        try:
            result = subprocess.run(
                [bin_to_try, "--version"],
                capture_output=True, text=True, timeout=10,
                env=env,
            )
            output = result.stdout.strip()
            m = re.match(r'OpenClaw\s+(\S+)\s*\(?(\w+)?\)?', output)
            if m:
                info["version"] = m.group(1)
                info["commit"] = m.group(2) or ""
            elif output:
                info["version"] = output
        except Exception:
            pass

        # Method 2 (fallback): read version from package.json
        if info["version"] == "unknown" and os.path.exists(pkg_json):
            try:
                with open(pkg_json, "r", encoding="utf-8") as f:
                    pkg = json.load(f)
                ver = pkg.get("version", "")
                if ver:
                    info["version"] = ver
            except Exception:
                pass

        # Get update time from package.json or binary mtime
        for path_to_check in [pkg_json, openclaw_bin]:
            if os.path.exists(path_to_check):
                try:
                    mtime = os.path.getmtime(path_to_check)
                    info["updatedAt"] = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
                    break
                except Exception:
                    pass

        # Get latest notified version: try live check if cache is stale, then fallback to cache
        info["latestNotified"] = ""
        info["lastCheckedAt"] = ""
        latest_info = self._check_latest_version()
        if latest_info:
            info["latestNotified"] = latest_info.get("version", "")
            info["lastCheckedAt"] = latest_info.get("checkedAt", "")

        return info

    def get_overview(self) -> dict:
        agents = self.get_agents()  # already enriched with _status, _cron_stats, _skills_count
        cron_jobs = self.get_cron_jobs()
        version_info = self.get_version_info()

        # Count stats
        total_agents = len(agents)
        total_jobs = len(cron_jobs)
        enabled_jobs = sum(1 for j in cron_jobs if j["enabled"])

        # Today's runs
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000
        error_jobs = sum(1 for j in cron_jobs if j["lastStatus"] == "error" and (j.get("lastRunAtMs") or 0) >= today_start)
        ok_jobs = sum(1 for j in cron_jobs if j["lastStatus"] == "ok" and (j.get("lastRunAtMs") or 0) >= today_start)

        return {
            "version": version_info,
            "agents": agents,
            "cronJobs": cron_jobs,
            "stats": {
                "totalAgents": total_agents,
                "totalCronJobs": total_jobs,
                "enabledCronJobs": enabled_jobs,
                "okRuns": ok_jobs,
                "errorRuns": error_jobs,
            }
        }

    def _get_active_agents(self) -> set[str]:
        """Check all agents' sessions.json files for recently active sessions.
        Returns set of agent IDs that have a session with updatedAt within the last 15 minutes."""
        active_agents: set[str] = set()
        now_ms = int(time.time() * 1000)
        FIFTEEN_MIN_MS = 15 * 60 * 1000

        agents_dir = os.path.join(OPENCLAW_ROOT, "agents")
        if not os.path.isdir(agents_dir):
            return active_agents

        for agent_id in os.listdir(agents_dir):
            sessions_file = os.path.join(agents_dir, agent_id, "sessions", "sessions.json")
            if not os.path.exists(sessions_file):
                continue
            try:
                with open(sessions_file, "r", encoding="utf-8") as f:
                    sessions = json.load(f)
            except Exception:
                continue

            for key, session in sessions.items():
                if not isinstance(session, dict):
                    continue
                # Skip cron/background sessions — only count real chat sessions
                if ":cron:" in key:
                    continue
                updated_at = session.get("updatedAt", 0)
                if isinstance(updated_at, (int, float)) and (now_ms - updated_at) < FIFTEEN_MIN_MS:
                    active_agents.add(agent_id)
                    break  # one active session is enough

        return active_agents

    # --- Model Usage ---

    def _usage_cache_path(self) -> str:
        return os.path.join(OPENCLAW_ROOT, "dashboard", "backend", "data", "model_usage.json")

    def get_model_usage(self) -> dict:
        """Return cached model usage data for all providers."""
        cache_path = self._usage_cache_path()
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _run_refresh_script(self, script_name: str) -> dict:
        """Run a refresh script from the scripts directory."""
        import subprocess
        import sys

        candidates = [
            os.path.join(os.path.dirname(__file__), "..", "..", "scripts", script_name),
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts", script_name),
        ]
        script = None
        for c in candidates:
            if os.path.exists(c):
                script = c
                break

        if not script:
            return {"ok": False, "error": f"script not found: {script_name}"}

        try:
            result = subprocess.run(
                [sys.executable, script],
                capture_output=True, text=True, timeout=120,
                cwd=os.path.dirname(script),
            )
            if result.returncode == 0:
                return {"ok": True, "output": result.stdout.strip()[-500:]}
            else:
                return {"ok": False, "error": result.stderr.strip()[-500:]}
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "refresh timed out (2 min)"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def refresh_minimax_usage(self) -> dict:
        return self._run_refresh_script("refresh_minimax.py")

    def refresh_deepseek_usage(self) -> dict:
        return self._run_refresh_script("refresh_deepseek.py")

    def get_active_sessions(self) -> list[dict]:
        """Return active sessions (updated within 15 min) for all agents."""
        import time as _time
        now_ms = int(_time.time() * 1000)
        FIFTEEN_MIN_MS = 15 * 60 * 1000

        agents_dir = os.path.join(OPENCLAW_ROOT, "agents")
        if not os.path.isdir(agents_dir):
            return []

        active_sessions = []
        for agent_id in os.listdir(agents_dir):
            sessions_file = os.path.join(agents_dir, agent_id, "sessions", "sessions.json")
            if not os.path.exists(sessions_file):
                continue
            try:
                with open(sessions_file, "r", encoding="utf-8") as f:
                    sessions = json.load(f)
            except Exception:
                continue

            for session_key, session in sessions.items():
                if not isinstance(session, dict):
                    continue
                updated_at = session.get("updatedAt", 0)
                if not isinstance(updated_at, (int, float)):
                    continue
                if now_ms - updated_at > FIFTEEN_MIN_MS:
                    continue

                is_cron = ":cron:" in session_key
                status = session.get("status", "")

                # Extract channel info
                channel = ""
                delivery_ctx = session.get("deliveryContext", {})
                if isinstance(delivery_ctx, dict):
                    channel = delivery_ctx.get("channel", "")
                if not channel:
                    channel = session.get("lastChannel", "")

                started_at = session.get("startedAt", 0)
                if not isinstance(started_at, (int, float)):
                    started_at = 0

                active_sessions.append({
                    "agentId": agent_id,
                    "agentName": AGENT_NAME_MAP.get(agent_id, agent_id),
                    "sessionKey": session_key,
                    "isCron": is_cron,
                    "status": status,
                    "updatedAtMs": updated_at,
                    "startedAtMs": started_at,
                    "channel": channel,
                    "model": session.get("model", ""),
                    "label": session.get("label", ""),
                    "systemSent": session.get("systemSent", False),
                    "chatType": session.get("chatType", ""),
                })

        # Sort: user sessions first, then by updatedAt desc
        active_sessions.sort(key=lambda s: (s["isCron"], -s["updatedAtMs"]))
        return active_sessions

    def get_agent_metrics(self, agent_id: str) -> dict:
        """Aggregate daily message/token/response-time metrics from session jsonl files.

        Scans:
        - sessions.json sessionFile references (current sessions)
        - *.jsonl and *.jsonl.reset.* files in sessions/ dir (historical / reset sessions)
        - Skips *.trajectory.jsonl* (different format) and cron sessions
        """
        from collections import defaultdict
        from datetime import datetime, timedelta

        sessions_dir = os.path.join(OPENCLAW_ROOT, "agents", agent_id, "sessions")
        sessions_file = os.path.join(sessions_dir, "sessions.json")

        # Collect all candidate jsonl files, excluding cron sessions
        candidate_files: set[str] = set()
        cron_file_paths: set[str] = set()  # Known cron session files to exclude

        # 1. From sessions.json metadata — separate cron vs non-cron
        if os.path.exists(sessions_file):
            try:
                with open(sessions_file, "r", encoding="utf-8") as f:
                    sessions_meta = json.load(f)
                for session_key, session_info in sessions_meta.items():
                    if not isinstance(session_info, dict):
                        continue
                    sf = session_info.get("sessionFile")
                    if not sf or not os.path.exists(sf):
                        continue
                    if ":cron:" in session_key:
                        cron_file_paths.add(sf)
                    else:
                        candidate_files.add(sf)
            except Exception:
                pass

        # 2. Scan directory for orphaned/renamed jsonl files not tracked in sessions.json
        #    OpenClaw renames old sessions to .jsonl.deleted.<ts> or .jsonl.reset.<ts>
        #    Also scan .jsonl.delete (old style) and .jsonl.checkpoint.* files
        if os.path.isdir(sessions_dir):
            for fn in os.listdir(sessions_dir):
                # Skip trajectory files (different schema)
                if "trajectory" in fn:
                    continue
                # Accept: foo.jsonl, foo.jsonl.reset.<ts>, foo.jsonl.deleted.<ts>,
                #          foo.jsonl.delete, foo.jsonl.checkpoint.<uuid>
                if ".jsonl" not in fn:
                    continue
                full_path = os.path.join(sessions_dir, fn)
                # Exclude files already classified (cron or already added as non-cron)
                if full_path in candidate_files or full_path in cron_file_paths:
                    continue
                # For orphaned files not in sessions.json, include them
                # (they are almost always non-cron; cron sessions don't get orphaned)
                candidate_files.add(full_path)

        # Accumulate raw data: date -> {messages, tokens, response_times[]}
        daily_raw: dict[str, dict] = defaultdict(lambda: {"messages": 0, "tokens": 0, "response_times": []})

        for jsonl_path in candidate_files:
            try:
                with open(jsonl_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
            except Exception:
                continue

            prev_ts: Optional[datetime] = None
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except Exception:
                    continue

                if event.get("type") != "message":
                    continue

                msg = event.get("message", {})
                role = msg.get("role")
                ts_str = event.get("timestamp") or msg.get("timestamp")

                if not ts_str:
                    continue

                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except Exception:
                    continue
                # Normalize to UTC so date-bucketing matches the frontend's
                # ISO date keys (also in UTC).
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                else:
                    ts = ts.astimezone(timezone.utc)

                date_key = ts.strftime("%Y-%m-%d")

                if role == "assistant":
                    daily_raw[date_key]["messages"] += 1
                    usage = msg.get("usage", {})
                    tokens = usage.get("totalTokens") or usage.get("total_tokens") or 0
                    if tokens:
                        daily_raw[date_key]["tokens"] += tokens

                    if prev_ts is not None:
                        delta_ms = int((ts - prev_ts).total_seconds() * 1000)
                        if 0 < delta_ms < 600_000:
                            daily_raw[date_key]["response_times"].append(delta_ms)
                elif role in ("user", "toolResult", "tool_result"):
                    prev_ts = ts

        # Build daily array for last 7 days (fill zeros for missing days)
        today = datetime.now(timezone.utc).date()
        daily = []
        total_messages = 0
        total_tokens = 0

        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            date_str = d.strftime("%Y-%m-%d")
            raw = daily_raw.get(date_str, {"messages": 0, "tokens": 0, "response_times": []})
            rts = raw["response_times"]
            avg_rt = int(sum(rts) / len(rts)) if rts else 0
            daily.append({
                "date": date_str,
                "messages": raw["messages"],
                "tokens": raw["tokens"],
                "avgResponseTimeMs": avg_rt,
            })
            total_messages += raw["messages"]
            total_tokens += raw["tokens"]

        return {
            "daily": daily,
            "total": {"messages": total_messages, "tokens": total_tokens},
        }

    def get_all_agents_metrics(self) -> list[dict]:
        """Return 7-day metrics summary for all agents, for comparison."""
        agents = self.get_agents()
        result = []
        for agent in agents:
            aid = agent.get("id", "main")
            metrics = self.get_agent_metrics(aid)
            total = metrics.get("total", {})
            daily = metrics.get("daily", [])
            # Compute average response time across active days
            rts = [d["avgResponseTimeMs"] for d in daily if d["avgResponseTimeMs"] > 0]
            avg_rt = int(sum(rts) / len(rts)) if rts else 0
            result.append({
                "id": aid,
                "name": agent.get("_displayName", aid),
                "emoji": agent.get("identity", {}).get("emoji") or (aid == "main" and "🎯" or "🤖"),
                "status": agent.get("_status", "idle"),
                "totalMessages": total.get("messages", 0),
                "totalTokens": total.get("tokens", 0),
                "avgResponseTimeMs": avg_rt,
                "daily": daily,
            })
        # Sort by total messages desc for visual impact
        result.sort(key=lambda x: x["totalMessages"], reverse=True)
        return result


service = OpenclawService()
