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
  // Backend may emit "unknown" when the session lacks a status field, plus
  // other variants we don't enumerate. Keep as string so callers must guard.
  status: string;
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

// Active sessions (one per agent × session-key)
export interface ActiveSession {
  agentId: string;
  agentName: string;
  sessionKey: string;
  isCron: boolean;
  status: string;
  updatedAtMs: number;
  startedAtMs: number;
  channel: string;
  model: string;
  label: string;
  systemSent: boolean;
  chatType: string;
}

// Models
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
}

export interface ProviderInfo {
  provider: string;
  baseUrl: string;
  models: ModelInfo[];
}

export interface UsageInfo {
  plan?: string;
  quota_calls?: number;
  quota_hours?: number;
  used_percent?: number;
  total_credit?: number;
  balance?: number;
  voice_used_percent?: number;
  updated_at?: number;
  error?: string | null;
  page_percents_found?: number[];
}

export type ModelUsage = Record<string, UsageInfo>;

// Log analysis
export interface LogInsight {
  type: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  agentId?: string;
  agentName?: string;
  maxAge?: number;
  count?: number;
  lastSeen?: string;
  diagId?: string;
  line?: string;
}

export interface LogAnalysis {
  insights: LogInsight[];
  stats: Record<string, number>;
  sources: string[];
}

export interface LogsResponse {
  lines: string[];
  path?: string;
  error?: string;
}

// Generic ok/error envelope used by refresh + open-path endpoints
export interface OkResponse {
  ok: boolean;
  output?: string;
  error?: string;
  path?: string;
}

// UI page identifier — kept in one place so App.tsx, Layout.tsx, and any
// component that wants to navigate use the same union.
export type Page = 'overview' | 'cron' | 'skills' | 'models' | 'logs' | 'sessions' | 'collab';
