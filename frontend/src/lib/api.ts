// 生产模式走相对路径（前后端同源），开发模式走 Vite proxy
const API_BASE = import.meta.env.PROD ? '' : '';

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  overview: (init?: RequestInit) => fetchJson('/api/overview', init),
  agents: (init?: RequestInit) => fetchJson('/api/agents', init),
  agentsMetrics: (init?: RequestInit) => fetchJson('/api/agents/metrics', init),
  cron: (init?: RequestInit) => fetchJson('/api/cron', init),
  skills: (agentId: string, init?: RequestInit) =>
    fetchJson(`/api/skills/${agentId}`, init),
  agentMetrics: (agentId: string, init?: RequestInit) =>
    fetchJson(`/api/agents/${agentId}/metrics`, init),
  models: (init?: RequestInit) => fetchJson('/api/models', init),
  modelUsage: (init?: RequestInit) => fetchJson('/api/models/usage', init),
  refreshUsage: (provider: string, init?: RequestInit) =>
    fetch(`${API_BASE}/api/models/usage/refresh/${provider}`, {
      method: 'POST',
      ...init,
    }).then((r) => r.json()),
  sessions: (init?: RequestInit) => fetchJson('/api/sessions/active', init),
  logs: (type: 'stdout' | 'stderr', init?: RequestInit) =>
    fetchJson(`/api/logs/${type}?lines=500`, init),
  logAnalysis: (init?: RequestInit) => fetchJson('/api/logs/analysis', init),
  version: (init?: RequestInit) => fetchJson('/api/version', init),
  versionHistory: (init?: RequestInit) => fetchJson('/api/version/history', init),
};

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
