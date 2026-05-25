import { useEffect, useState } from 'react';
import { api, isAbort } from '../lib/api';
import { cn, formatDuration, formatTime } from '../lib/utils';
import { AgentMetricsChart } from './AgentMetricsChart';
import {
  ArrowLeft,
  Bot,
  Clock,
  Cpu,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Globe,
  Zap,
} from 'lucide-react';
import type { Agent, AgentMetricsResponse, CronJob, Skill } from '../lib/types';

interface AgentDetailProps {
  agentId: string;
  onBack: () => void;
}

export function AgentDetail({ agentId, onBack }: AgentDetailProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [metrics, setMetrics] = useState<AgentMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      api.agents({ signal: ac.signal }),
      api.cron({ signal: ac.signal }),
      api.skills(agentId, { signal: ac.signal }),
      api.agentMetrics(agentId, { signal: ac.signal }).catch((err) => {
        if (isAbort(err)) throw err;
        console.warn('agentMetrics load failed:', err);
        return { daily: [], total: { messages: 0, tokens: 0 } };
      }),
    ])
      .then(([agents, allJobs, agentSkills, agentMetrics]) => {
        if (ac.signal.aborted) return;
        const found = agents.find((a: Agent) => a.id === agentId);
        setAgent(found || null);
        setJobs(allJobs.filter((j: CronJob) => j.agentId === agentId));
        setSkills(agentSkills);
        setMetrics(agentMetrics);
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-slate-500">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-xl p-12 text-center text-rose-400 text-sm">
        <div className="mb-2">加载失败</div>
        <div className="text-xs text-rose-400/60 font-mono">{error}</div>
        <button
          onClick={onBack}
          className="mt-4 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← 返回
        </button>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="glass-card rounded-xl p-12 text-center text-slate-500">
        Agent 未找到
      </div>
    );
  }

  const emoji = agent.identity?.emoji || (agent.id === 'main' ? '🎯' : '🤖');

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Back + Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-lg border border-white/[0.06]">
            {emoji}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{agent._displayName}</h2>
            <div className="text-[11px] text-slate-500 font-mono">{agent.id}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info + Skills */}
        <div className="lg:col-span-1 space-y-4">
          {/* Agent Info */}
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              Agent 信息
            </h3>
            <div className="space-y-3">
              <InfoRow icon={Cpu} label="模型" value={agent._model_display} />
              <InfoRow icon={Globe} label="Provider" value={agent._provider} mono />
              <InfoRow icon={Layers} label="Skills" value={`${skills.length} 个`} />
              <InfoRow icon={Clock} label="Cron 任务" value={`${jobs.length} 个`} />
              <InfoRow icon={Zap} label="状态" value={
                <span className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full font-medium border',
                  agent._status === 'working' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                  agent._status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  agent._status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  agent._status === 'error' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                  'bg-slate-500/10 text-slate-400 border-slate-500/20'
                )}>
                  {agent._status === 'working' ? '工作中' : agent._status === 'online' ? '在线' : agent._status === 'warning' ? '异常' : agent._status === 'error' ? '错误' : '空闲'}
                </span>
              } />
            </div>
          </div>

          {/* Skills */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-indigo-400" />
              Skills ({skills.length})
            </h3>
            {skills.length === 0 ? (
              <p className="text-xs text-slate-500">暂无 Skills</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {skills.map((s) => (
                  <div key={s.name} className="p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-start gap-2">
                      <FileText className={cn(
                        'w-3.5 h-3.5 mt-0.5 flex-shrink-0',
                        s.source === 'agent' ? 'text-indigo-400' : 'text-emerald-400'
                      )} />
                      <div className="min-w-0">
                        <div className="text-xs text-slate-300 font-medium">{s.name}</div>
                        {s.description ? (
                          <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{s.description}</div>
                        ) : (
                          <div className="text-[10px] text-slate-600/50 mt-0.5 italic">暂无说明</div>
                        )}
                      </div>
                    </div>
                    {s.keywords && (
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-5.5">
                        {s.keywords.split(/[,，、\s]+/).filter(Boolean).slice(0, 4).map((kw, i) => (
                          <span
                            key={i}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400/70 border border-indigo-500/20"
                          >
                            {kw.replace(/^[""](.+?)[""]$/, '$1')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Metrics + Cron Jobs */}
        <div className="lg:col-span-2 space-y-4">
          {metrics && <AgentMetricsChart daily={metrics.daily} />}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Cron 任务 ({jobs.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                    <th className="text-left py-2.5 px-4 text-[10px] font-medium text-slate-500">状态</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-medium text-slate-500">任务</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-medium text-slate-500">调度</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-medium text-slate-500">上次</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-medium text-slate-500">耗时</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-medium text-slate-500">下次</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                        该 Agent 没有 Cron 任务
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            {job.lastStatus === 'ok' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : job.lastStatus === 'error' ? (
                              <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            {!job.enabled && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-400">停用</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="text-xs text-slate-200 font-medium">{job.name}</div>
                          {job.description && (
                            <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate">{job.description}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="text-[11px] text-slate-300">{job.scheduleDisplay || job.schedule}</span>
                          {job.scheduleDisplay && job.schedule !== job.scheduleDisplay && (
                            <code className="text-[10px] text-slate-600 ml-1 cursor-help" title={`Cron: ${job.schedule}`}>
                              ({job.schedule})
                            </code>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-slate-400">
                          {formatTime(job.lastRunAtMs)}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-slate-400">
                          {job.lastDurationMs ? formatDuration(job.lastDurationMs) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-indigo-400/70">
                          {formatTime(job.nextRunAtMs)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 flex items-center gap-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      <span className={cn('text-xs text-slate-300', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}

