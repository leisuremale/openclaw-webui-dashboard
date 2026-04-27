import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { cn, formatDuration, formatTime } from '../lib/utils';
import {
  Bot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  Cpu,
  ChevronRight,
  ChevronDown,
  Zap,
  TrendingUp,
  TrendingDown,
  Tag,
  RefreshCw,
  History,
  X,
  BarChart3,
  MessageSquare,
} from 'lucide-react';

interface Agent {
  id: string;
  name?: string;
  identity?: { emoji?: string; name?: string };
  _displayName: string;
  _model_display: string;
  _provider: string;
  _status: string;
  _cron_stats: { total: number; ok: number; error: number };
  _skills_count: number;
  workspace?: string;
}

interface Stats {
  totalAgents: number;
  totalCronJobs: number;
  enabledCronJobs: number;
  okRuns: number;
  errorRuns: number;
}

interface VersionInfo {
  version: string;
  commit: string;
  updatedAt: string;
  latestNotified: string;
  lastCheckedAt: string;
}

interface VersionHistoryItem {
  version: string;
  installedAt: string;
  installedAtMs: number;
  source: string;
  isCurrent: boolean;
}

interface VersionHistoryResp {
  current: string;
  history: VersionHistoryItem[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  online: { label: '在线', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: Zap },
  idle: { label: '空闲', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', icon: Clock },
  working: { label: '工作中', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: Zap },
  warning: { label: '异常', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
  error: { label: '故障', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', icon: AlertTriangle },
};

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-xl p-5 h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="glass-card rounded-xl h-52" />
        ))}
      </div>
    </div>
  );
}

function relativeDay(installedAtMs: number): string {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (installedAtMs >= startOfTodayMs) return '今天';
  if (installedAtMs >= startOfTodayMs - dayMs) return '昨天';
  if (installedAtMs >= startOfTodayMs - 2 * dayMs) return '前天';

  const days = Math.floor((startOfTodayMs - installedAtMs) / dayMs) + 1;
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

const sourceMeta: Record<string, { label: string; tone: 'precise' | 'approx' | 'unknown'; tip: string }> = {
  'plugin-runtime-deps': {
    label: '精确',
    tone: 'precise',
    tip: '从 plugin-runtime-deps 目录创建时间获取，对应实际安装时刻',
  },
  current: {
    label: '当前',
    tone: 'precise',
    tip: '当前生效的版本，时间来自 package.json 修改时间',
  },
  persisted: {
    label: '已记录',
    tone: 'precise',
    tip: '历史记录文件中已保存的精确时间',
  },
  'backup-filename': {
    label: '推断',
    tone: 'approx',
    tip: '从 openclaw.json.backup-YYYY.M.DD 备份文件名 + 修改时间推断（可能与实际安装时间相差几分钟）',
  },
};

interface AgentMetricSummary {
  id: string;
  name: string;
  emoji: string;
  status: string;
  totalMessages: number;
  totalTokens: number;
  avgResponseTimeMs: number;
  daily: { date: string; messages: number; tokens: number; avgResponseTimeMs: number }[];
}

const AGENT_COLORS: Record<string, string> = {
  main: '#818cf8',
  'xiao-le': '#34d399',
  'xiao-zhi': '#fbbf24',
  'mo-yan': '#f87171',
  'an-bao': '#38bdf8',
  cto: '#a78bfa',
  'ma-nong': '#e879f9',
  'xiao-xing': '#a3e635',
  'bei-ma': '#22d3ee',
  'mo-ping': '#fb923c',
};

interface OverviewProps {
  onViewAgent?: (id: string) => void;
}

export function Overview({ onViewAgent }: OverviewProps) {
  const [data, setData] = useState<{ agents: Agent[]; stats: Stats; version?: VersionInfo } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<VersionHistoryResp | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricsData, setMetricsData] = useState<AgentMetricSummary[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [cronDetail, setCronDetail] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    api.overview().then((d) => {
      setData(d);
      setLoading(false);
    });
    const iv = setInterval(() => api.overview().then(setData), 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    api.agentsMetrics()
      .then((d) => setMetricsData(d || []))
      .catch(() => {});
  }, []);

  // ESC to close modals or collapse detail
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHistory) setShowHistory(false);
        else if (cronDetail) setCronDetail(null);
        else if (expanded) setExpanded(false);
      }
    };
    if (showHistory || expanded || cronDetail) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [showHistory, expanded, cronDetail]);

  const openHistory = () => {
    setShowHistory(true);
    if (!historyData) {
      setHistoryLoading(true);
      api
        .versionHistory()
        .then((d) => setHistoryData(d))
        .catch(() => setHistoryData({ current: '', history: [] }))
        .finally(() => setHistoryLoading(false));
    }
  };

  // Build daily breakdown: date → [{ agent, messages, tokens, avgResponseTimeMs }]
  const dailyBreakdown = useMemo(() => {
    const dateMap = new Map<string, { id: string; messages: number; tokens: number; rt: number }[]>();
    for (const agent of metricsData) {
      for (const d of agent.daily) {
        if (d.messages === 0 && d.tokens === 0 && d.avgResponseTimeMs === 0) continue;
        if (!dateMap.has(d.date)) dateMap.set(d.date, []);
        dateMap.get(d.date)!.push({
          id: agent.id,
          messages: d.messages,
          tokens: d.tokens,
          rt: d.avgResponseTimeMs,
        });
      }
    }
    const dates = [...dateMap.keys()].sort((a, b) => b.localeCompare(a));
    const days = dates.map((date) => ({ date, entries: dateMap.get(date)! }));
    // 7-day global max for cross-day comparison
    const allEntries = days.flatMap((d) => d.entries);
    const globalMaxMsg = Math.max(1, ...allEntries.map((e) => e.messages));
    const globalMaxTok = Math.max(1, ...allEntries.map((e) => e.tokens));
    const globalMaxRt = Math.max(1, ...allEntries.map((e) => e.rt));
    return { days, globalMaxMsg, globalMaxTok, globalMaxRt };
  }, [metricsData]);

  // Quick lookup for agent display info
  const agentInfo = useMemo(() => {
    const map = new Map<string, { name: string; emoji: string; color: string }>();
    for (const a of metricsData) {
      map.set(a.id, { name: a.name, emoji: a.emoji, color: AGENT_COLORS[a.id] || '#64748b' });
    }
    return map;
  }, [metricsData]);

  // Filter today's cron jobs (must be before early return for hooks ordering)
  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }, []);
  const rawCronJobs = (data as any)?.cronJobs || [];
  const rawAgents = (data as any)?.agents || [];
  const todayOkJobs = useMemo(() => rawCronJobs.filter((j: any) => j.lastStatus === 'ok' && (j.lastRunAtMs || 0) >= todayStart), [rawCronJobs, todayStart]);
  const todayErrorJobs = useMemo(() => rawCronJobs.filter((j: any) => j.lastStatus === 'error' && (j.lastRunAtMs || 0) >= todayStart), [rawCronJobs, todayStart]);
  const agentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of rawAgents) m.set(a.id, a._displayName);
    return m;
  }, [rawAgents]);

  if (loading || !data) return <LoadingSkeleton />;

  const { agents, stats, version } = data;
  const cronHealthRate = stats.totalCronJobs > 0
    ? Math.round((stats.okRuns / (stats.okRuns + stats.errorRuns || 1)) * 100)
    : 100;

  const isNewer = version?.latestNotified && version?.version && version.latestNotified > version.version;

  const kpi = [
    {
      label: 'Agent 总数',
      value: stats.totalAgents,
      icon: Bot,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      sub: `${stats.enabledCronJobs} cron 任务运行中`,
    },
    {
      label: 'Cron 健康度',
      value: `${cronHealthRate}%`,
      icon: cronHealthRate >= 80 ? TrendingUp : TrendingDown,
      color: cronHealthRate >= 80 ? 'text-emerald-400' : 'text-amber-400',
      bg: cronHealthRate >= 80 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
      sub: `${stats.okRuns} 成功 / ${stats.errorRuns} 失败`,
    },
    {
      label: '今日成功',
      value: stats.okRuns,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      sub: '今日完成的任务',
      clickable: true,
      onClick: () => setCronDetail('ok'),
    },
    {
      label: '今日失败',
      value: stats.errorRuns,
      icon: AlertTriangle,
      color: stats.errorRuns > 0 ? 'text-rose-400' : 'text-slate-500',
      bg: stats.errorRuns > 0 ? 'bg-rose-500/10' : 'bg-slate-500/10',
      sub: stats.errorRuns > 0 ? '需要关注' : '一切正常',
      clickable: true,
      onClick: () => setCronDetail('error'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Version Banner */}
      {version && (
        <div
          role="button"
          tabIndex={0}
          onClick={openHistory}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openHistory();
            }
          }}
          className="glass-card glass-card-hover rounded-xl p-4 flex flex-wrap items-center gap-4 cursor-pointer group transition-colors hover:border-indigo-500/30"
          title="点击查看历史升级记录"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20">
              <Tag className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Openclaw 版本</div>
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <span className="font-mono">{version.version}</span>
                {version.commit && (
                  <span className="text-[10px] text-slate-500 font-mono bg-white/[0.04] px-1.5 py-0.5 rounded">
                    {version.commit.slice(0, 7)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <RefreshCw className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500">更新时间</div>
              <div className="font-mono text-sm text-slate-200">{version.updatedAt}</div>
            </div>
          </div>

          {version.latestNotified && (
            <div className="flex items-center gap-3 ml-auto">
              {isNewer ? (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">
                  有新版本 {version.latestNotified}
                </span>
              ) : (
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                  已是最新
                </span>
              )}
            </div>
          )}

          {/* Click affordance — slides into ml-auto if no latestNotified */}
          <div className={cn(
            'flex items-center gap-1.5 text-[11px] text-slate-500 group-hover:text-indigo-300 transition-colors',
            !version.latestNotified && 'ml-auto'
          )}>
            <History className="w-3.5 h-3.5" />
            <span>升级记录</span>
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpi.map((item: any, idx) => (
          <div
            key={item.label}
            role={item.clickable ? 'button' : undefined}
            tabIndex={item.clickable ? 0 : undefined}
            onClick={item.clickable ? item.onClick : undefined}
            onKeyDown={item.clickable ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.onClick?.(); }
            } : undefined}
            className={cn(
              'glass-card rounded-xl p-5',
              item.clickable ? 'glass-card-hover cursor-pointer' : '',
            )}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', item.bg)}>
                <item.icon className={cn('w-4 h-4', item.color)} />
              </div>
              <span className="text-xs text-slate-500 font-medium">{item.label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-100 mb-1">{item.value}</div>
            <div className="text-[11px] text-slate-500">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Agent 状态总览 */}
      <div className="glass-card rounded-xl overflow-hidden">
        {/* Header — always visible, click to expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20 flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-100">Agent 状态总览</div>
            <div className="text-[11px] text-slate-500">
              {agents.filter(a => a._status === 'working').length} 个工作中 ·{' '}
              {agents.filter(a => a._status === 'online').length} 个在线 ·{' '}
              {agents.filter(a => a._status === 'idle').length} 个空闲
              {agents.filter(a => a._status === 'warning' || a._status === 'error').length > 0 && (
                <span className="text-rose-400 ml-1">
                  · {agents.filter(a => a._status === 'warning' || a._status === 'error').length} 个异常
                </span>
              )}
            </div>
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 text-slate-400 transition-transform duration-300 flex-shrink-0',
            expanded && 'rotate-180'
          )} />
        </button>

        {/* Expanded detail — SVG vertical bar charts */}
        {expanded && dailyBreakdown.days.length > 0 && (() => {
          const { days, globalMaxMsg, globalMaxTok, globalMaxRt } = dailyBreakdown;
          const dayCount = days.length;
          const maxAgentsPerDay = Math.max(1, ...days.map(d => d.entries.length));
          const barW = 18;
          const barGap = 3;
          const groupW = Math.max(80, maxAgentsPerDay * (barW + barGap) + 4);
          const groupGap = 1;
          const chartW = dayCount * (groupW + groupGap);
          const barH = 110;
          const padTop = 16;
          const svgW = chartW + 32;
          const svgH = barH + padTop + 24;

          // Build agent-index lookup per day for consistent bar positions
          const allAgentIds = [...new Set(days.flatMap(d => d.entries.map(e => e.id)))].sort();

          return (
            <div className="pt-4 pb-1 px-4 space-y-5 border-t border-white/[0.04]">
              {/* 消息量 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-medium text-slate-400">消息量（近 7 天）</span>
                </div>
                <div className="overflow-x-auto">
                  <svg width={svgW} height={svgH} className="block">
                    <g transform={`translate(22,${padTop})`}>
                      {[0, 0.5, 1].map(t => {
                        const y = barH * (1 - t);
                        return <line key={t} x1={0} x2={chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 2" />;
                      })}
                      {days.map((day, di) => {
                        const gx = di * (groupW + groupGap);
                        const totalBarsW = day.entries.length * barW + (day.entries.length - 1) * barGap;
                        const startX = (groupW - totalBarsW) / 2;
                        const sorted = [...day.entries].filter(e => e.messages > 0).sort((a, b) => b.messages - a.messages);
                        return (
                          <g key={day.date} transform={`translate(${gx},0)`}>
                            <text x={groupW / 2} y={barH + 14} textAnchor="middle" fill="#475569" fontSize="10">
                              {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                            </text>
                            {sorted.map((entry, ai) => {
                              const info = agentInfo.get(entry.id) || { name: entry.id, emoji: '🤖', color: '#64748b' };
                              const h = (entry.messages / globalMaxMsg) * barH;
                              const bx = startX + ai * (barW + barGap);
                              return (
                                <g key={entry.id}>
                                  <rect x={bx} y={barH - h} width={barW} height={h} rx={2} fill={info.color} opacity={0.85} />
                                  <text x={bx + barW / 2} y={barH - h - 4} textAnchor="middle" fill="#94a3b8" fontSize="8">
                                    {info.name}
                                  </text>
                                  <title>{`${info.name} · ${day.date}\n消息: ${entry.messages}`}</title>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              </div>

              {/* Token 使用量 */}
              <div className="pt-2 border-t border-white/[0.04]">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-400">Token 使用量（近 7 天）</span>
                </div>
                <div className="overflow-x-auto">
                  <svg width={svgW} height={svgH} className="block">
                    <g transform={`translate(22,${padTop})`}>
                      {[0, 0.5, 1].map(t => {
                        const y = barH * (1 - t);
                        return <line key={t} x1={0} x2={chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 2" />;
                      })}
                      {days.map((day, di) => {
                        const gx = di * (groupW + groupGap);
                        const sorted = [...day.entries].filter(e => e.tokens > 0).sort((a, b) => b.tokens - a.tokens);
                        const totalBarsW = sorted.length * barW + (sorted.length - 1) * barGap;
                        const startX = (groupW - totalBarsW) / 2;
                        return (
                          <g key={day.date} transform={`translate(${gx},0)`}>
                            <text x={groupW / 2} y={barH + 14} textAnchor="middle" fill="#475569" fontSize="10">
                              {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                            </text>
                            {sorted.map((entry, ai) => {
                              const info = agentInfo.get(entry.id) || { name: entry.id, emoji: '🤖', color: '#64748b' };
                              const h = (entry.tokens / globalMaxTok) * barH;
                              const bx = startX + ai * (barW + barGap);
                              const formatted = entry.tokens >= 1000 ? `${(entry.tokens / 1000).toFixed(1)}k` : `${entry.tokens}`;
                              return (
                                <g key={entry.id}>
                                  <rect x={bx} y={barH - h} width={barW} height={h} rx={2} fill={info.color} opacity={0.85} />
                                  <text x={bx + barW / 2} y={barH - h - 4} textAnchor="middle" fill="#94a3b8" fontSize="8">
                                    {info.name}
                                  </text>
                                  <title>{`${info.name} · ${day.date}\nTokens: ${formatted}`}</title>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              </div>

              {/* 响应时间 */}
              <div className="pt-2 border-t border-white/[0.04]">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-medium text-slate-400">响应时间（近 7 天）</span>
                </div>
                <div className="overflow-x-auto">
                  <svg width={svgW} height={svgH} className="block">
                    <g transform={`translate(22,${padTop})`}>
                      {[0, 0.5, 1].map(t => {
                        const y = barH * (1 - t);
                        return <line key={t} x1={0} x2={chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 2" />;
                      })}
                      {/* Draw connecting lines per agent across days */}
                      {allAgentIds.map(aid => {
                        const info = agentInfo.get(aid) || { name: aid, emoji: '🤖', color: '#64748b' };
                        const pts: [number, number][] = [];
                        days.forEach((day, di) => {
                          const entry = day.entries.find(e => e.id === aid && e.rt > 0);
                          if (entry) {
                            const gx = di * (groupW + groupGap);
                            const sorted = day.entries.filter(e => e.rt > 0);
                            const totalW = sorted.length * barW + (sorted.length - 1) * barGap;
                            const startX = (groupW - totalW) / 2;
                            const idx = sorted.findIndex(e => e.id === aid);
                            if (idx >= 0) {
                              const cx = gx + startX + idx * (barW + barGap) + barW / 2;
                              const cy = barH - (entry.rt / globalMaxRt) * barH;
                              pts.push([cx, cy]);
                            }
                          }
                        });
                        if (pts.length < 2) return null;
                        return (
                          <polyline
                            key={aid}
                            points={pts.map(p => p.join(',')).join(' ')}
                            fill="none"
                            stroke={info.color}
                            strokeWidth={1}
                            opacity={0.4}
                          />
                        );
                      })}
                      {/* Draw dots per day */}
                      {days.map((day, di) => {
                        const gx = di * (groupW + groupGap);
                        const sorted = [...day.entries].filter(e => e.rt > 0).sort((a, b) => b.rt - a.rt);
                        const totalW = sorted.length * barW + (sorted.length - 1) * barGap;
                        const startX = (groupW - totalW) / 2;
                        return (
                          <g key={day.date} transform={`translate(${gx},0)`}>
                            <text x={groupW / 2} y={barH + 14} textAnchor="middle" fill="#475569" fontSize="10">
                              {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                            </text>
                            {sorted.map((entry, ai) => {
                              const info = agentInfo.get(entry.id) || { name: entry.id, emoji: '🤖', color: '#64748b' };
                              const cy = barH - (entry.rt / globalMaxRt) * barH;
                              const cx = startX + ai * (barW + barGap) + barW / 2;
                              return (
                                <g key={entry.id}>
                                  <circle cx={cx} cy={cy} r={4} fill={info.color} opacity={0.9} />
                                  <text x={cx} y={cy - 7} textAnchor="middle" fill="#94a3b8" fontSize="8">
                                    {info.name}
                                  </text>
                                  <title>{`${info.name} · ${day.date}\n响应: ${formatDuration(entry.rt)}`}</title>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Empty state when no metrics data */}
        {expanded && dailyBreakdown.days.length === 0 && (
          <div className="px-5 pb-5 border-t border-white/[0.04]">
            <div className="pt-4 text-center py-6 text-xs text-slate-600">暂无数据</div>
          </div>
        )}
      </div>

      {/* Agents Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            Agent 状态
            <span className="text-[11px] font-normal text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded-full">
              {agents.length} 个
            </span>
          </h2>
          <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            每 15s 刷新
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent, idx) => {
            const status = statusConfig[agent._status] || statusConfig.idle;
            const StatusIcon = status.icon;
            const emoji = agent.identity?.emoji || (agent.id === 'main' ? '🎯' : '🤖');
            const hasCronStats = agent._cron_stats.total > 0;
            const cronOkRate = hasCronStats
              ? Math.round((agent._cron_stats.ok / agent._cron_stats.total) * 100)
              : 0;

            return (
              <div
                key={agent.id}
                onClick={() => onViewAgent?.(agent.id)}
                className="glass-card glass-card-hover rounded-xl p-5 group cursor-pointer animate-in fade-in"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-lg border border-white/[0.06] flex-shrink-0">
                      {emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 text-sm truncate">
                        {agent._displayName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{agent.id}</div>
                    </div>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border flex-shrink-0 ml-2',
                    status.bg,
                    status.color
                  )}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Cpu className="w-3 h-3" /> 模型
                    </span>
                    <span className="text-slate-300 text-[11px] font-medium truncate ml-2 max-w-[120px]">
                      {agent._model_display}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Layers className="w-3 h-3" /> Skills
                    </span>
                    <span className={cn(
                      'text-[11px] font-medium',
                      agent._skills_count > 0 ? 'text-slate-300' : 'text-slate-600'
                    )}>
                      {agent._skills_count}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Cron
                    </span>
                    <div className="flex items-center gap-2">
                      {hasCronStats ? (
                        <>
                          <div className="w-16 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                cronOkRate >= 80 ? 'bg-emerald-500' : cronOkRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              )}
                              style={{ width: `${cronOkRate}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400">{agent._cron_stats.total}</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-600">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 group-hover:text-indigo-300 transition-colors flex items-center gap-1">
                    详情
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono">
                    {agent._provider}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Version History Modal */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="glass-card rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20">
                  <History className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 text-sm">Openclaw 升级历史</div>
                  <div className="text-[11px] text-slate-500">每次升级到的版本与时间</div>
                </div>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {historyLoading && (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-14 rounded-lg bg-white/[0.03]" />
                  ))}
                </div>
              )}

              {!historyLoading && historyData && historyData.history.length === 0 && (
                <div className="text-center py-10 text-sm text-slate-500">
                  暂无历史记录
                </div>
              )}

              {!historyLoading && historyData && historyData.history.length > 0 && (
                <div className="relative">
                  {/* Timeline rail */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-indigo-500/30 via-white/[0.06] to-transparent" />

                  <ul className="space-y-3">
                    {historyData.history.map((item) => {
                      const meta = sourceMeta[item.source] || {
                        label: item.source,
                        tone: 'unknown' as const,
                        tip: '',
                      };
                      const toneClass =
                        meta.tone === 'precise'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : meta.tone === 'approx'
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : 'text-slate-400 bg-slate-500/10 border-slate-500/20';

                      return (
                        <li key={item.version} className="relative pl-8">
                          {/* Timeline dot */}
                          <div
                            className={cn(
                              'absolute left-0 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                              item.isCurrent
                                ? 'bg-indigo-500 border-indigo-300 shadow-lg shadow-indigo-500/40'
                                : 'bg-slate-800 border-slate-600'
                            )}
                          >
                            {item.isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                          </div>

                          <div
                            className={cn(
                              'rounded-lg p-3 border transition-colors',
                              item.isCurrent
                                ? 'bg-indigo-500/[0.08] border-indigo-500/30'
                                : 'bg-white/[0.02] border-white/[0.04]'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono font-semibold text-slate-100">{item.version}</span>
                                {item.isCurrent && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-medium">
                                    当前版本
                                  </span>
                                )}
                              </div>
                              <span
                                className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', toneClass)}
                                title={meta.tip}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-mono text-slate-300">{item.installedAt}</span>
                              <span className="text-slate-500">{relativeDay(item.installedAtMs)}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.06] text-[11px] text-slate-500 flex items-center justify-between">
              <span>
                <span className="text-emerald-400">●</span> 精确 ·{' '}
                <span className="text-amber-400">●</span> 推断
              </span>
              <span>共 {historyData?.history.length ?? 0} 条记录</span>
            </div>
          </div>
        </div>
      )}

      {/* Cron Detail Modal */}
      {cronDetail && (() => {
        const jobs = cronDetail === 'ok' ? todayOkJobs : todayErrorJobs;
        const isOk = cronDetail === 'ok';
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
            onClick={() => setCronDetail(null)}
          >
            <div
              className="glass-card rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl border border-white/[0.08]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center border',
                    isOk ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
                  )}>
                    {isOk
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : <AlertTriangle className="w-4 h-4 text-rose-400" />
                    }
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 text-sm">
                      {isOk ? '今日成功任务' : '今日失败任务'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {jobs.length} 个
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCronDetail(null)}
                  className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {jobs.length === 0 ? (
                  <div className="text-center py-10 text-sm text-slate-500">
                    暂无{isOk ? '成功' : '失败'}任务
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((job: any) => (
                      <div
                        key={job.id}
                        className={cn(
                          'rounded-lg p-3 border',
                          isOk ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-rose-500/[0.04] border-rose-500/10'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-200 truncate">{job.name}</span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium border flex-shrink-0',
                            isOk
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                          )}>
                            {isOk ? '成功' : '失败'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{agentNameMap.get(job.agentId) || job.agentId}</span>
                          <span>·</span>
                          <span>{formatTime(job.lastRunAtMs)}</span>
                          {job.lastDurationMs > 0 && (
                            <>
                              <span>·</span>
                              <span>{formatDuration(job.lastDurationMs)}</span>
                            </>
                          )}
                        </div>
                        {!isOk && job.lastError && (
                          <div className="mt-1.5 text-[11px] text-rose-400/70 bg-rose-500/[0.04] rounded px-2 py-1 font-mono break-all">
                            {job.lastError.slice(0, 200)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
