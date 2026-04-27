// 生产模式走相对路径（前后端同源），开发模式走 Vite proxy
const API_BASE = import.meta.env.PROD ? '' : '';

async function fetchJson(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  overview: () => fetchJson('/api/overview'),
  agents: () => fetchJson('/api/agents'),
  agentsMetrics: () => fetchJson('/api/agents/metrics'),
  cron: () => fetchJson('/api/cron'),
  skills: (agentId: string) => fetchJson(`/api/skills/${agentId}`),
  agentMetrics: (agentId: string) => fetchJson(`/api/agents/${agentId}/metrics`),
  models: () => fetchJson('/api/models'),
  modelUsage: () => fetchJson('/api/models/usage'),
  refreshUsage: (provider: string) =>
    fetch(`${API_BASE}/api/models/usage/refresh/${provider}`, { method: 'POST' }).then(r => r.json()),
  sessions: () => fetchJson('/api/sessions/active'),
  logAnalysis: () => fetchJson('/api/logs/analysis'),
  version: () => fetchJson('/api/version'),
  versionHistory: () => fetchJson('/api/version/history'),
};
