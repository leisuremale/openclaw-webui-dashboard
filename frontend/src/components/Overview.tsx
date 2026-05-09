import { useEffect, useState, useMemo } from 'react';
import { api, isAbort } from '../lib/api';
import { cn, formatDuration } from '../lib/utils';
import {
  Bot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Zap,
  Tag,
  RefreshCw,
  History,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import type {
  Agent,
  AgentMetricSummary,
  CronJob,
  OverviewResponse,
  VersionHistoryResp,
} from '../lib/types';
import { AgentCard } from './AgentCard';
import { VersionHistoryModal } from './VersionHistoryModal';
import { CronDetailModal } from './CronDetailModal';

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
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<VersionHistoryResp | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricsData, setMetricsData] = useState<AgentMetricSummary[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [cronDetail, setCronDetail] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let isFirst = true;
    const load = () =>
      api
        .overview({ signal: ac.signal })
        .then((d) => {
          setData(d);
          if (isFirst) {
            setLoading(false);
            isFirst = false;
          }
        })
        .catch((err) => {
          if (!isAbort(err)) console.warn('overview load failed:', err);
        });
    load();
    const iv = setInterval(load, 15000);
    return () => {
      clearInterval(iv);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    api
      .agentsMetrics({ signal: ac.signal })
      .then((d) => setMetricsData(d || []))
      .catch((err) => {
        if (!isAbort(err)) console.warn('agentsMetrics load failed:', err);
      });
    return () => ac.abort();
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

  const { todayStr, yesterdayStr } = useMemo(() => {
    const now = new Date();
    return {
      todayStr: now.toISOString().slice(0, 10),
      yesterdayStr: new Date(now.getTime() - 86400000).toISOString().slice(0, 10),
    };
  }, []);

  // Today / yesterday message & token totals
  const todayMsgTotal = useMemo(() => {
    let sum = 0;
    for (const a of metricsData) {
      const d = a.daily.find(d => d.date === todayStr);
      if (d) sum += d.messages;
    }
    return sum;
  }, [metricsData, todayStr]);

  const yesterdayMsgTotal = useMemo(() => {
    let sum = 0;
    for (const a of metricsData) {
      const d = a.daily.find(d => d.date === yesterdayStr);
      if (d) sum += d.messages;
    }
    return sum;
  }, [metricsData, yesterdayStr]);

  const todayTokenTotal = useMemo(() => {
    let sum = 0;
    for (const a of metricsData) {
      const d = a.daily.find(d => d.date === todayStr);
      if (d) sum += d.tokens;
    }
    return sum;
  }, [metricsData, todayStr]);

  const yesterdayTokenTotal = useMemo(() => {
    let sum = 0;
    for (const a of metricsData) {
      const d = a.daily.find(d => d.date === yesterdayStr);
      if (d) sum += d.tokens;
    }
    return sum;
  }, [metricsData, yesterdayStr]);

  const msgChangePercent = yesterdayMsgTotal > 0
    ? (((todayMsgTotal - yesterdayMsgTotal) / yesterdayMsgTotal) * 100).toFixed(0)
    : '0';
  const tokenChangePercent = yesterdayTokenTotal > 0
    ? (((todayTokenTotal - yesterdayTokenTotal) / yesterdayTokenTotal) * 100).toFixed(0)
    : '0';

  const formatToken = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  };
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
  const rawCronJobs = useMemo<CronJob[]>(() => data?.cronJobs ?? [], [data]);
  const rawAgents = useMemo<Agent[]>(() => data?.agents ?? [], [data]);
  const todayOkJobs = useMemo(
    () => rawCronJobs.filter((j) => j.lastStatus === 'ok' && (j.lastRunAtMs || 0) >= todayStart),
    [rawCronJobs, todayStart],
  );
  const todayErrorJobs = useMemo(
    () => rawCronJobs.filter((j) => j.lastStatus === 'error' && (j.lastRunAtMs || 0) >= todayStart),
    [rawCronJobs, todayStart],
  );
  const agentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of rawAgents) m.set(a.id, a._displayName);
    return m;
  }, [rawAgents]);

  if (loading || !data) return <LoadingSkeleton />;

  const { agents, stats, version } = data;
  const isNewer = version?.latestNotified && version?.version && version.latestNotified > version.version;

  const msgChange = Number(msgChangePercent);
  const tokenChange = Number(tokenChangePercent);
  const kpi = [
    {
      label: '今日消息总数',
      value: todayMsgTotal,
      icon: Bot,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      sub: (
        <span className={msgChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          较昨日 {msgChange >= 0 ? '+' : ''}{msgChangePercent}%
        </span>
      ),
    },
    {
      label: '今日Token量',
      value: formatToken(todayTokenTotal),
      icon: Zap,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      sub: (
        <span className={tokenChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          较昨日 {tokenChange >= 0 ? '+' : ''}{tokenChangePercent}%
        </span>
      ),
    },
    {
      label: '今日Cron成功',
      value: stats.okRuns,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      sub: `${stats.enabledCronJobs} cron 任务运行中`,
      clickable: true,
      onClick: () => setCronDetail('ok'),
    },
    {
      label: '今日Cron失败',
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
        {kpi.map((item, idx) => (
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
              共{agents.length}个Agent
              · {agents.filter(a => a._status === 'working').length}个工作中
              · {agents.filter(a => a._status === 'online').length}个在线
              · {agents.filter(a => a._status === 'idle').length}个空闲
              · {agents.filter(a => a._status === 'warning' || a._status === 'error').length}个故障
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
          {agents.map((agent, idx) => (
            <AgentCard key={agent.id} agent={agent} idx={idx} onViewAgent={onViewAgent} />
          ))}
        </div>
      </div>

      {/* Version History Modal */}
      {showHistory && (
        <VersionHistoryModal
          loading={historyLoading}
          data={historyData}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Cron Detail Modal */}
      {cronDetail && (
        <CronDetailModal
          kind={cronDetail}
          jobs={cronDetail === 'ok' ? todayOkJobs : todayErrorJobs}
          agentNameMap={agentNameMap}
          onClose={() => setCronDetail(null)}
        />
      )}

    </div>
  );
}
