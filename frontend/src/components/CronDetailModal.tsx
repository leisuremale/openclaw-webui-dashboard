import { cn, formatDuration, formatTime } from '../lib/utils';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { CronJob } from '../lib/types';
import { ModalShell } from './ModalShell';

interface CronDetailModalProps {
  kind: 'ok' | 'error';
  jobs: CronJob[];
  agentNameMap: Map<string, string>;
  onClose: () => void;
}

export function CronDetailModal({ kind, jobs, agentNameMap, onClose }: CronDetailModalProps) {
  const isOk = kind === 'ok';
  return (
    <ModalShell
      onClose={onClose}
      labelledBy="cron-detail-title"
      className="glass-card rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl border border-white/[0.08]"
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
              <div id="cron-detail-title" className="font-semibold text-slate-100 text-sm">
                {isOk ? '今日成功任务' : '今日失败任务'}
              </div>
              <div className="text-[11px] text-slate-500">
                {jobs.length} 个
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
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
              {jobs.map((job) => (
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
    </ModalShell>
  );
}
