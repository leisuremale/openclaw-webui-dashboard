import { cn } from '../lib/utils';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Cpu,
  Layers,
  Zap,
} from 'lucide-react';
import type { Agent } from '../lib/types';

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  online: { label: '在线', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: Zap },
  idle: { label: '空闲', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', icon: Clock },
  working: { label: '工作中', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: Zap },
  warning: { label: '异常', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
  error: { label: '故障', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', icon: AlertTriangle },
};

interface AgentCardProps {
  agent: Agent;
  onViewAgent?: (id: string) => void;
}

export function AgentCard({ agent, onViewAgent }: AgentCardProps) {
  const status = statusConfig[agent._status] || statusConfig.idle;
  const StatusIcon = status.icon;
  const emoji = agent.identity?.emoji || (agent.id === 'main' ? '🎯' : '🤖');
  const hasCronStats = agent._cron_stats.total > 0;
  const cronOkRate = hasCronStats
    ? Math.round((agent._cron_stats.ok / agent._cron_stats.total) * 100)
    : 0;

  return (
    <div
      onClick={() => onViewAgent?.(agent.id)}
      className="glass-card glass-card-hover rounded-xl p-5 group cursor-pointer"
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
}
