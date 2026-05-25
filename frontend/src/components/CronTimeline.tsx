import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, isAbort } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { cn, formatDuration, formatTime } from '../lib/utils';
import { Clock, CheckCircle2, XCircle, AlertTriangle, Calendar, Search, Filter } from 'lucide-react';
import type { Agent, CronJob } from '../lib/types';

type AgentLite = Pick<Agent, 'id' | '_displayName'>;

export function CronTimeline() {
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [filter, setFilter] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | 'all'>('all');

  const cronFetcher = useCallback(
    (signal: AbortSignal) => api.cron({ signal }),
    [],
  );
  const { data: jobsData } = usePolling<CronJob[]>(cronFetcher, 30000);
  const jobs = useMemo(() => jobsData ?? [], [jobsData]);

  useEffect(() => {
    const ac = new AbortController();
    api
      .agents({ signal: ac.signal })
      .then((ags) => setAgents(ags))
      .catch((err) => {
        if (!isAbort(err)) console.warn('agents load failed:', err);
      });
    return () => ac.abort();
  }, []);

  const agentNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    agents.forEach((a) => { m[a.id] = a._displayName; });
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    let result = jobs;
    if (filter !== 'all') result = result.filter((j) => j.agentId === filter);
    if (statusFilter !== 'all') result = result.filter((j) => j.lastStatus === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q) ||
          (agentNameMap[j.agentId] || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [jobs, filter, statusFilter, search, agentNameMap]);

  const okCount = jobs.filter((j) => j.lastStatus === 'ok').length;
  const errCount = jobs.filter((j) => j.lastStatus === 'error').length;

  return (
    <div className="space-y-5">
      {/* Top bar: filters + search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filter === 'all'
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                : 'border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            )}
          >
            全部 ({jobs.length})
          </button>
          {agents.map((a) => {
            const count = jobs.filter((j) => j.agentId === a.id).length;
            if (count === 0) return null;
            return (
              <button
                key={a.id}
                onClick={() => setFilter(a.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  filter === a.id
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    : 'border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )}
              >
                {a._displayName} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium transition-all',
                statusFilter === 'all' ? 'bg-white/[0.06] text-slate-200' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              全部
            </button>
            <button
              onClick={() => setStatusFilter('ok')}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1',
                statusFilter === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <CheckCircle2 className="w-2.5 h-2.5" />
              {okCount}
            </button>
            <button
              onClick={() => setStatusFilter('error')}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1',
                statusFilter === 'error' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <XCircle className="w-2.5 h-2.5" />
              {errCount}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-36 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg py-1.5 pl-7 pr-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">状态</th>
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">任务</th>
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">Agent</th>
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">调度</th>
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">上次执行</th>
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">耗时</th>
                <th className="text-left py-3 px-4 text-[11px] font-medium text-slate-400">下次执行</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Filter className="w-5 h-5 mx-auto mb-2 opacity-50" />
                    没有匹配的任务
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <CronRow
                    key={job.id}
                    job={job}
                    agentName={agentNameMap[job.agentId] || job.agentId}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function statusIcon(status: string) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'error') return <XCircle className="w-4 h-4 text-rose-400" />;
  return <AlertTriangle className="w-4 h-4 text-slate-500" />;
}

function CronRow({ job, agentName }: { job: CronJob; agentName: string }) {
  return (
    <tr className="hover:bg-white/[0.02] transition-colors group">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {statusIcon(job.lastStatus)}
          {!job.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">禁用</span>
          )}
          {job.consecutiveErrors > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
              ×{job.consecutiveErrors}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="font-medium text-slate-200 text-[13px]">{job.name}</div>
        {job.description && (
          <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">{job.description}</div>
        )}
        {job.lastError && job.lastStatus === 'error' && (
          <div className="text-[11px] text-rose-400/80 mt-0.5 max-w-xs truncate" title={job.lastError}>
            {job.lastError}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        <span className="text-[11px] text-slate-400 bg-white/[0.04] px-2 py-1 rounded">{agentName}</span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5 text-[12px] text-slate-300">
          <Calendar className="w-3 h-3 text-slate-500 flex-shrink-0" />
          <span>{job.scheduleDisplay || job.schedule}</span>
          {job.scheduleDisplay && job.schedule !== job.scheduleDisplay && (
            <code className="text-[10px] text-slate-600 cursor-help" title={`Cron: ${job.schedule}`}>
              ({job.schedule})
            </code>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-[12px] text-slate-400">{formatTime(job.lastRunAtMs)}</td>
      <td className="py-3 px-4 text-[12px] text-slate-400">
        {job.lastDurationMs ? (
          <span
            className={cn(
              'font-mono',
              job.lastDurationMs > 60000 ? 'text-amber-400' : 'text-slate-400',
            )}
          >
            {formatDuration(job.lastDurationMs)}
          </span>
        ) : (
          <span className="text-slate-600">-</span>
        )}
      </td>
      <td className="py-3 px-4 text-[12px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-indigo-400 flex-shrink-0" />
          {formatTime(job.nextRunAtMs)}
        </div>
      </td>
    </tr>
  );
}
