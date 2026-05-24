import { useEffect, useState } from 'react';
import { api, isAbort } from '../lib/api';
import { cn, formatDuration, formatTime } from '../lib/utils';
import {
  GitBranch,
  Terminal,
  Clock,
  Cpu,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import type { CollabResponse, CollabTool, CollabTask } from '../lib/types';

const TOOL_ICONS: Record<string, React.ElementType> = {
  'claude-code': Terminal,
  codex: Cpu,
};

const TOOL_GRADIENTS: Record<string, string> = {
  'claude-code': 'from-amber-500/20 to-orange-500/20 border-amber-500/20',
  codex: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/20',
};

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="glass-card rounded-xl h-32" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card rounded-xl h-28" />
        ))}
      </div>
    </div>
  );
}

function ToolStatusCard({ tool, todayStats }: { tool: CollabTool; todayStats?: { calls: number; success: number; failed: number } }) {
  const Icon = TOOL_ICONS[tool.type] || Terminal;
  const gradient = TOOL_GRADIENTS[tool.type] || 'from-slate-500/20 to-slate-500/20 border-slate-500/20';
  const stats = todayStats || { calls: 0, success: 0, failed: 0 };

  const statusLabel = !tool.installed ? '未安装' : !tool.authOk ? '认证失败' : '就绪';
  const statusColor = !tool.installed
    ? 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    : !tool.authOk
    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  const StatusIcon = !tool.installed ? XCircle : !tool.authOk ? AlertTriangle : CheckCircle2;

  return (
    <div className={cn('glass-card glass-card-hover rounded-xl p-5')}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center border',
            gradient
          )}>
            <Icon className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <div className="font-semibold text-slate-100 text-sm">{tool.name}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {tool.installed ? tool.version || 'installed' : 'not installed'}
            </div>
          </div>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border',
          statusColor
        )}>
          <StatusIcon className="w-3 h-3" />
          {statusLabel}
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span>今日: {stats.calls} 次调用</span>
        {stats.calls > 0 && (
          <>
            <span className="text-emerald-400">{stats.success} 成功</span>
            {stats.failed > 0 && <span className="text-rose-400">{stats.failed} 失败</span>}
          </>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, idx }: { task: CollabTask; idx: number }) {
  const isRunning = task.status === 'running';
  const isDone = task.status === 'done';
  const isFailed = task.status === 'failed' || task.status === 'error';

  return (
    <div
      className="glass-card glass-card-hover rounded-xl p-4 animate-in fade-in"
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="mt-1.5 flex-shrink-0">
          {isRunning && (
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)] animate-pulse" />
          )}
          {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {isFailed && <XCircle className="w-4 h-4 text-rose-400" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: status + tool + agent */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium border',
              isRunning && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
              isDone && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              isFailed && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
            )}>
              {isRunning ? '运行中' : isDone ? '已完成' : '失败'}
            </span>
            <span className="text-[10px] text-slate-500">
              {task.toolType === 'claude-code' ? 'Claude Code' : task.toolType}
            </span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <span>{task.spawnedByEmoji}</span>
              <span>{task.spawnedByAgentName}</span>
            </span>
          </div>

          {/* Task description */}
          <div className="text-sm text-slate-200 truncate mb-2">
            {task.taskLabel || task.label}
          </div>

          {/* Bottom row: timing + actions */}
          <div className="flex items-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {task.startedAtMs > 0 ? formatTime(task.startedAtMs) : '—'}
            </span>
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {formatDuration(task.durationMs)}
            </span>
            {task.model && (
              <span className="text-slate-600 font-mono">{task.model}</span>
            )}
            <span className="ml-auto flex items-center gap-1 text-indigo-400 cursor-pointer hover:text-indigo-300 transition-colors">
              <ExternalLink className="w-3 h-3" />
              查看会话
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CollabPanel() {
  const [data, setData] = useState<CollabResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let isFirst = true;
    const load = () =>
      api
        .collab({ signal: ac.signal })
        .then((d) => {
          setData(d);
          if (isFirst) {
            setLoading(false);
            isFirst = false;
          }
        })
        .catch((err) => {
          if (!isAbort(err)) console.warn('collab load failed:', err);
        });
    load();
    const iv = setInterval(load, 10000);
    return () => {
      clearInterval(iv);
      ac.abort();
    };
  }, []);

  if (loading || !data) return <LoadingSkeleton />;

  const { tools, activeTasks, todayStats, history } = data;
  const claudeTool = tools.find((t) => t.type === 'claude-code');
  const codexTool = tools.find((t) => t.type === 'codex');
  const claudeStats = todayStats['claude-code'];

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center border border-violet-500/20">
            <GitBranch className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">协同调度</h2>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span>{tools.filter((t) => t.installed && t.authOk).length} 个就绪</span>
              <span>·</span>
              <span>{activeTasks.length} 活跃</span>
              <span>·</span>
              <span>{history.length} 条记录</span>
              <span>·</span>
              <span className="text-slate-600">每 10s 刷新</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Status Cards */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-indigo-400" />
          工具状态
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {claudeTool && <ToolStatusCard tool={claudeTool} todayStats={claudeStats} />}
          {codexTool && <ToolStatusCard tool={codexTool} todayStats={todayStats['codex']} />}
          {!claudeTool && !codexTool && (
            <div className="glass-card rounded-xl p-8 text-center col-span-2">
              <WifiOff className="w-8 h-8 mx-auto mb-3 text-slate-600" />
              <div className="text-slate-400 text-sm">未检测到外部工具</div>
            </div>
          )}
        </div>
      </div>

      {/* Active Tasks */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-blue-400" />
          活跃任务 ({activeTasks.length})
        </h3>

        {activeTasks.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-5 h-5 text-slate-500" />
            </div>
            <div className="text-slate-400 font-medium mb-1">当前无活跃任务</div>
            <div className="text-xs text-slate-600">所有 ACP 调度任务已完成</div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task, idx) => (
              <TaskCard key={task.sessionKey} task={task} idx={idx} />
            ))}
          </div>
        )}
      </div>

      {/* History Toggle */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3 hover:text-slate-200 transition-colors"
          >
            <Clock className="w-4 h-4 text-slate-400" />
            调用历史 ({history.length})
            <span className={cn(
              'text-[10px] transition-transform',
              showHistory && 'rotate-90'
            )}>
              <ArrowRight className="w-3 h-3" />
            </span>
          </button>

          {showHistory && (
            <div className="space-y-2">
              {history.slice(0, 20).map((task, idx) => (
                <TaskCard key={task.sessionKey} task={task} idx={idx} />
              ))}
              {history.length > 20 && (
                <div className="text-center text-xs text-slate-500 py-2">
                  显示最近 20 条，共 {history.length} 条记录
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
