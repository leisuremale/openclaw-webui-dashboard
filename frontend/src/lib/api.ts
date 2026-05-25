import type {
  ActiveSession,
  Agent,
  AgentMetricSummary,
  AgentMetricsResponse,
  CollabResponse,
  CronJob,
  LogAnalysis,
  LogsResponse,
  ModelUsage,
  OkResponse,
  OverviewResponse,
  ProviderInfo,
  Skill,
  VersionHistoryResp,
  VersionInfo,
} from './types';

// Both dev (Vite proxy) and prod (FastAPI same-origin) use relative paths;
// no base URL needed. Keep this constant so callers can build absolute URLs
// (e.g. <a href={...}>) if needed in the future.
export const API_BASE = '';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string };
      if (body && typeof body.detail === 'string') detail = `: ${body.detail}`;
    } catch {
      // ignore; body not JSON
    }
    throw new Error(`HTTP ${res.status}${detail}`);
  }
  return (await res.json()) as T;
}

export const api = {
  overview: (init?: RequestInit) => fetchJson<OverviewResponse>('/api/overview', init),
  agents: (init?: RequestInit) => fetchJson<Agent[]>('/api/agents', init),
  agentsMetrics: (init?: RequestInit) =>
    fetchJson<AgentMetricSummary[]>('/api/agents/metrics', init),
  cron: (init?: RequestInit) => fetchJson<CronJob[]>('/api/cron', init),
  skills: (agentId: string, init?: RequestInit) =>
    fetchJson<Skill[]>(`/api/skills/${agentId}`, init),
  agentMetrics: (agentId: string, init?: RequestInit) =>
    fetchJson<AgentMetricsResponse>(`/api/agents/${agentId}/metrics`, init),
  models: (init?: RequestInit) => fetchJson<ProviderInfo[]>('/api/models', init),
  modelUsage: (init?: RequestInit) => fetchJson<ModelUsage>('/api/models/usage', init),
  refreshUsage: (provider: string, init?: RequestInit) =>
    fetchJson<OkResponse>(`/api/models/usage/refresh/${provider}`, {
      method: 'POST',
      ...init,
    }),
  refreshUsageStatus: (provider: string, init?: RequestInit) =>
    fetchJson<{ running: boolean; started_at: number; ended_at: number; ok: boolean; output?: string; error?: string }>(
      `/api/models/usage/refresh/${provider}/status`,
      init,
    ),
  sessions: (init?: RequestInit) =>
    fetchJson<ActiveSession[]>('/api/sessions/active', init),
  logs: (type: 'stdout' | 'stderr', init?: RequestInit) =>
    fetchJson<LogsResponse>(`/api/logs/${type}?lines=500`, init),
  logAnalysis: (init?: RequestInit) => fetchJson<LogAnalysis>('/api/logs/analysis', init),
  collab: (init?: RequestInit) => fetchJson<CollabResponse>('/api/collab/status', init),
  version: (init?: RequestInit) => fetchJson<VersionInfo>('/api/version', init),
  versionHistory: (init?: RequestInit) =>
    fetchJson<VersionHistoryResp>('/api/version/history', init),
  openPath: (path: string, init?: RequestInit) =>
    fetchJson<OkResponse>(`/api/open-path?path=${encodeURIComponent(path)}`, init),
};

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
