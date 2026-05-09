import { cn } from '../lib/utils';
import { History, X } from 'lucide-react';
import type { VersionHistoryResp } from '../lib/types';

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

interface VersionHistoryModalProps {
  loading: boolean;
  data: VersionHistoryResp | null;
  onClose: () => void;
}

export function VersionHistoryModal({ loading, data, onClose }: VersionHistoryModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
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
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-white/[0.03]" />
              ))}
            </div>
          )}

          {!loading && data && data.history.length === 0 && (
            <div className="text-center py-10 text-sm text-slate-500">
              暂无历史记录
            </div>
          )}

          {!loading && data && data.history.length > 0 && (
            <div className="relative">
              {/* Timeline rail */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-indigo-500/30 via-white/[0.06] to-transparent" />

              <ul className="space-y-3">
                {data.history.map((item) => {
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
          <span>共 {data?.history.length ?? 0} 条记录</span>
        </div>
      </div>
    </div>
  );
}
