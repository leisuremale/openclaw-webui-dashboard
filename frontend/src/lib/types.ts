// Shared API response types. Keep in sync with backend/app/services/openclaw.py.

export interface AgentIdentity {
  emoji?: string;
  name?: string;
}

export interface CronStats {
  total: number;
  ok: number;
  error: number;
}

export interface Agent {
  id: string;
  name?: string;
  identity?: AgentIdentity;
  _displayName: string;
  _model_display: string;
  _provider: string;
  _status: string;
  _cron_stats: CronStats;
  _skills_count: number;
  workspace?: string;
  model?: unknown;
}

export interface CronJob {
  id: string;
  agentId: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: string;
  scheduleDisplay?: string;
  scheduleKind: string;
  lastStatus: string;
  consecutiveErrors: number;
  lastError: string;
  lastDurationMs: number;
  lastRunAtMs?: number;
  nextRunAtMs?: number;
}

export interface Skill {
  name: string;
  source: string;
  path: string;
  description: string;
  keywords?: string;
}

export interface OverviewStats {
  totalAgents: number;
  totalCronJobs: number;
  enabledCronJobs: number;
  okRuns: number;
  errorRuns: number;
}

export interface VersionInfo {
  version: string;
  commit: string;
  updatedAt: string;
  latestNotified: string;
  lastCheckedAt: string;
}

export interface VersionHistoryItem {
  version: string;
  installedAt: string;
  installedAtMs: number;
  source: string;
  isCurrent: boolean;
}

export interface VersionHistoryResp {
  current: string;
  history: VersionHistoryItem[];
}

export interface OverviewResponse {
  agents: Agent[];
  stats: OverviewStats;
  cronJobs?: CronJob[];
  version?: VersionInfo;
}

export interface DailyMetric {
  date: string;
  messages: number;
  tokens: number;
  avgResponseTimeMs: number;
}

export interface AgentMetricsTotal {
  messages: number;
  tokens: number;
}

export interface AgentMetricsResponse {
  daily: DailyMetric[];
  total: AgentMetricsTotal;
}

export interface AgentMetricSummary {
  id: string;
  name: string;
  emoji: string;
  status: string;
  totalMessages: number;
  totalTokens: number;
  avgResponseTimeMs: number;
  daily: DailyMetric[];
}

// Collab (ACP) types
export interface CollabTool {
  type: 'claude-code' | 'codex';
  name: string;
  installed: boolean;
  version?: string;
  authOk: boolean;
}

export interface CollabTask {
  sessionKey: string;
  toolType: string;
  targetAgentId: string;
  spawnedByAgentId: string;
  spawnedByAgentName: string;
  spawnedByEmoji: string;
  label: string;
  taskLabel: string;
  status: 'running' | 'done' | 'failed' | 'error';
  startedAtMs: number;
  updatedAtMs: number;
  durationMs: number;
  model?: string;
  lastChannel?: string;
}

export interface CollabResponse {
  tools: CollabTool[];
  activeTasks: CollabTask[];
  todayStats: Record<string, { calls: number; success: number; failed: number }>;
  history: CollabTask[];
}
