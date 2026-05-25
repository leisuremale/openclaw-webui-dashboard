# Claude / agent guide

This file is what an AI coding agent (Claude Code, Cursor, etc.) should read
first when working in this repo. Humans should read `README.md`; this file
captures the operational shape that humans usually keep in their heads.

## What this project is

A local-first FastAPI + React 19 dashboard that monitors a running
[OpenClaw](https://github.com/leisuremale/OpenClaw) install. **Zero database**
— all data is read directly from the file system under `~/.openclaw/`. The
frontend is a single SPA served by FastAPI in production, or by Vite dev
server on port 5173 in dev (proxies `/api` to 18790).

## Layout you'll work in most

```
backend/app/
  main.py                    FastAPI entry + auth middleware + CORS + SPA mount
  routers/
    overview.py              All non-collab API routes
    collab.py                /api/collab/status only
  services/
    openclaw.py              Main service class (the big one)
    collab.py                ACP session → tasks aggregation
    helpers/
      agents.py              AGENT_NAME_MAP, AGENTS_DIR, load_agent_identities
      atomic_io.py           mkstemp + os.replace
      cron_format.py         cron → 人话
      log_tail.py            cross-platform tail
      skills_parser.py       YAML frontmatter + README parsing
  models/                    (intentionally empty; raw dict returns for now)
  scripts/                   refresh_minimax.py, refresh_deepseek.py (Playwright)

frontend/src/
  App.tsx                    Top-level page switcher + selectedAgent overlay
  components/                One file per page + ModalShell + AgentCard etc.
  lib/
    api.ts                   Typed API client (fetchJson<T>)
    types.ts                 SINGLE SOURCE OF TRUTH for API response shapes
    usePolling.ts            ALWAYS use this for polled endpoints
    agent-colors.ts          AGENT_COLORS + agentColor()
    utils.ts                 cn, formatDuration, formatTime, formatCount, compareSemver
    chart-utils.ts           Pure SVG chart helpers
```

## Verify-before-claiming-done

Run these before saying anything passes. If you skip one, you didn't verify.

```bash
# Frontend
cd frontend && npx tsc -b && npx eslint src && npx vite build

# Backend (syntax — full venv is in backend/.venv/ on macOS hosts)
cd backend && python -m py_compile $(git ls-files 'app/**/*.py' 'scripts/**/*.py')
```

CI runs the same things in `.github/workflows/ci.yml`. Don't push without
local green.

## Patterns to follow

### Polling components

**Always use `lib/usePolling.ts`**, never roll your own `setInterval` + `useState`. The hook handles per-tick AbortController, sequence-number guards against stale responses, and first-load loading flag semantics. Inline polling has burned us multiple times (races, perpetual skeletons on error).

```tsx
const fetcher = useCallback((signal: AbortSignal) => api.overview({ signal }), []);
const { data, loading, error } = usePolling<OverviewResponse>(fetcher, 15000);
```

### Modal accessibility

**Always use `components/ModalShell.tsx`** for any new modal — it gives `role="dialog"`, `aria-modal`, focus trap, ESC, restore-focus on close. Don't hand-roll backdrop + `onClick={onClose}` (we did this for three modals, now it lives in one place).

### API types

`lib/types.ts` is the single source of truth for what comes off the wire. Components must not declare their own interfaces that shadow types in there. If the backend changes shape, update `types.ts` first, then let TypeScript find the call sites.

`lib/api.ts` exports a typed `fetchJson<T>` — every endpoint method must declare its return type. Never let `any` leak.

### Backend constants

Path constants and agent identity helpers live in `app/services/helpers/agents.py`: `OPENCLAW_ROOT`, `AGENTS_DIR`, `OPENCLAW_CONFIG_PATH`, `AGENT_NAME_MAP`, `AGENT_ORDER`, `default_emoji()`, `load_agent_identities()`. **Don't redefine these in other modules** — `collab.py` used to and it drifted.

### Cross-platform file ops

The dashboard runs on macOS (primary), Windows (test hosts), and Linux (CI/server). Whenever you shell out:

- `tail`/`head`/`grep`/`cat` → use Python equivalents (`helpers/log_tail.tail_lines` etc.). Coreutils don't exist on Windows.
- `open`/`xdg-open`/`start` → branch on `sys.platform` (see `openclaw.open_path` for the canonical pattern).
- PATH joining → `os.pathsep`, not literal `":"`.
- Permission checks → POSIX mode bits on Unix; extension blocklist on Windows (`st_mode` is meaningless there).

### Caching / single-flight

Anything that hits the disk or network on a per-request hot path needs a TTL cache + a single-flight guard. See `OpenclawService._METRICS_CACHE` (60s TTL on agent metrics) and `_NPM_REFRESH_INFLIGHT` (lock + flag for the npm registry refresh thread). Polling 15s × 10 agents × 50 file opens adds up fast.

### Background work in HTTP handlers

**Don't `subprocess.run(timeout=120)` from inside a request handler.** The Playwright refresh scripts taught us this — a request worker should not hold for 2 minutes, especially not while a headed Chromium window pops up. Use the `_start_refresh_job` pattern: spawn into a daemon thread, store state in a class dict, expose a `.../status` endpoint for the frontend to poll.

## Things that look like bugs but aren't

- `OPENCLAW_DASHBOARD_TRUST_PROXY` defaults to off — meaning any request with `X-Forwarded-For` (etc.) gets demanded a Bearer token even from 127.0.0.1. This is on purpose; without it the loopback bypass is one nginx hop away from being silently disabled. README explains the opt-in.
- `OPENCLAW_DASHBOARD_CORS=*` forces `allow_credentials=False` and warns. This is also on purpose — `*` + credentials is a browser-rejected combination per CORS spec.
- Collab "authOk" is heuristic (env var / credential file existence). The previous true-probe was running `claude -p ... --dangerously-skip-permissions` on every poll; the new behavior is "report true if it looks ready" and let the actual call fail if it's not.

## What to read for context

- `README.md` — user-facing setup + API + env vars
- `MEMORY.md` — chronological decision log; the most recent session is at the top of dated sections (newest first)
- `docs/external-agent-panel-design.md` — CTO-reviewed design for the collab panel

## Authoring style

Project conventions (from `~/.claude/rules/coding-style.md`):

- Many small files > few large files. 200–400 lines typical, 800 hard cap. Overview hit 666 and was split.
- Immutability — new objects, never mutate. Especially important in reducers / memos.
- Early returns over deep nesting. Extract helpers before stacking ifs 4 deep.
- Names: `camelCase` vars/funcs, `PascalCase` types/components, `UPPER_SNAKE_CASE` constants, `useFoo` for hooks. Booleans get `is`/`has`/`should`/`can` prefixes.
- Never silently swallow errors. At minimum `logger.warning(...)` so operators can tell from logs that the dashboard degraded gracefully.

## Anti-patterns from review history

These were all real bugs we hit; if you see something similar, push back:

1. Shared lifetime AbortController across polling ticks — last-write-wins races.
2. `setLoading(true)` on every poll — refresh icon thrashing visible as flicker.
3. `useMemo(() => new Date()..., [])` — frozen at mount, fails across midnight.
4. `backdrop-filter: blur()` on many stacked scrolling cards — Mac Safari/Chrome flickers.
5. `animate-in fade-in` on polling-list items — keyframe replays on every refetch.
6. Subprocess in a request handler — blocks worker, kills latency.
7. `os.realpath(p)` then `os.lstat(p)` to check for symlinks — link already resolved, check is dead.
8. Path params as `str` with internal `if foo == "...": ... return error` — use FastAPI `Literal[...]` so 422 happens at the boundary.
