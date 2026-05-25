import { useEffect, useState, useMemo, useCallback } from 'react';
import { api, isAbort } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { cn, compareSemver } from '../lib/utils';
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Zap,
  Tag,
  RefreshCw,
  History,
  BarChart3,
} from 'lucide-react';
import type {
  Agent,
  AgentMetricSummary,
  CronJob,
  OverviewResponse,
  VersionHistoryResp,
} from '../lib/types';
import { AgentCard } from './AgentCard';
import { AgentsStatusBreakdown } from './AgentsStatusBreakdown';
import { VersionHistoryModal } from './VersionHistoryModal';
import { CronDetailModal } from './CronDetailModal';
import { agentColor } from '../lib/agent-colors';

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

interface OverviewProps {
  onViewAgent?: (id: string) => void;
}

export function Overview({ onViewAgent }: OverviewProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<VersionHistoryResp | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricsData, setMetricsData] = useState<AgentMetricSummary[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [cronDetail, setCronDetail] = useState<'ok' | 'error' | null>(null);
  // `dayTick` advances at most once per minute so "today" derivations
  // (cron-job filtering, message totals) cross midnight without a refresh.
  // We don't need second precision; a once-per-minute tick is enough to keep
  // the cutoff close to wall-clock midnight while costing one re-render/min.
  const [dayTick, setDayTick] = useState(0);

  const overviewFetcher = useCallback(
    (signal: AbortSignal) => api.overview({ signal }),
    [],
  );
  const { data, loading } = usePolling<OverviewResponse>(overviewFetcher, 15000);

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

  useEffect(() => {
    const iv = setInterval(() => setDayTick((t) => t + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  // ESC to collapse the agents-status breakdown panel. Modal ESC handling
  // lives inside ModalShell so we don't double-bind for showHistory/cronDetail.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showHistory && !cronDetail) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, showHistory, cronDetail]);

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
    // Re-derive when dayTick advances so midnight rollover takes effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTick]);

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

  // `null` signals "no comparable baseline" so the KPI sub-line renders an
  // em-dash instead of a misleading "+0%".
  const msgChangePercent =
    yesterdayMsgTotal > 0
      ? (((todayMsgTotal - yesterdayMsgTotal) / yesterdayMsgTotal) * 100).toFixed(0)
      : null;
  const tokenChangePercent =
    yesterdayTokenTotal > 0
      ? (((todayTokenTotal - yesterdayTokenTotal) / yesterdayTokenTotal) * 100).toFixed(0)
      : null;

  const formatToken = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  };
  const agentInfo = useMemo(() => {
    const map = new Map<string, { name: string; emoji: string; color: string }>();
    for (const a of metricsData) {
      map.set(a.id, { name: a.name, emoji: a.emoji, color: agentColor(a.id) });
    }
    return map;
  }, [metricsData]);

  // Filter today's cron jobs (must be before early return for hooks ordering).
  // Recomputed once per minute via dayTick so the cutoff follows wall-clock
  // midnight on long-lived sessions.
  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTick]);
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
  const isNewer = !!(
    version?.latestNotified &&
    version?.version &&
    compareSemver(version.latestNotified, version.version) > 0
  );

  const msgChange = msgChangePercent !== null ? Number(msgChangePercent) : 0;
  const tokenChange = tokenChangePercent !== null ? Number(tokenChangePercent) : 0;
  const kpi = [
    {
      label: '今日消息总数',
      value: todayMsgTotal,
      icon: Bot,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      sub: msgChangePercent === null ? (
        <span className="text-slate-500">较昨日 —</span>
      ) : (
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
      sub: tokenChangePercent === null ? (
        <span className="text-slate-500">较昨日 —</span>
      ) : (
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

        {/* Expanded detail — extracted to a memoized component so Overview's
            15s poll does not re-render three SVG charts. */}
        {expanded && (
          <AgentsStatusBreakdown dailyBreakdown={dailyBreakdown} agentInfo={agentInfo} />
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
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onViewAgent={onViewAgent} />
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
