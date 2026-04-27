import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { cn, formatDuration, formatTime } from '../lib/utils';
import {
  MessageSquare,
  Clock,
  CalendarClock,
  Cpu,
  Globe,
  Radio,
  Terminal,
  WifiOff,
  Zap,
} from 'lucide-react';

interface ActiveSession {
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

interface Agent {
  id: string;
  identity?: { emoji?: string; name?: string };
  _displayName: string;
}

function formatAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s 前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m 前`;
  const hr = Math.floor(min / 60);
  return `${hr}h${min % 60}m 前`;
}

function durationMs(startMs: number, endMs: number): string {
  if (!startMs) return '';
  const ms = (endMs || Date.now()) - startMs;
  return formatDuration(ms);
}

const channelIcons: Record<string, React.ElementType> = {
  webchat: Globe,
  feishu: MessageSquare,
  cli: Terminal,
};

export function ActiveSessions() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      Promise.all([
        api.sessions().catch(() => [] as ActiveSession[]),
        api.agents().catch(() => [] as Agent[]),
      ]).then(([s, a]) => {
        setSessions(s);
        setAgents(a);
        setLoading(false);
      });
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const agentMap = useMemo(() => {
    const m = new Map<string, { emoji: string; name: string }>();
    for (const a of agents) {
      m.set(a.id, {
        emoji: a.identity?.emoji || (a.id === 'main' ? '🎯' : '🤖'),
        name: a._displayName,
      });
    }
    return m;
  }, [agents]);

  const userSessions = sessions.filter((s) => !s.isCron);
  const cronSessions = sessions.filter((s) => s.isCron);
  const now = Date.now();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/20">
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">活跃会话</h2>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {userSessions.length} 用户会话
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {cronSessions.length} 定时任务
              </span>
              <span>·</span>
              <span className="text-slate-600">每 10s 刷新</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-full font-medium border transition-colors',
            sessions.length > 0
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
          )}>
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              sessions.length > 0 ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-slate-500'
            )} />
            {sessions.length > 0 ? '活跃中' : '无活跃会话'}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="glass-card rounded-xl p-16 text-center">
          <WifiOff className="w-10 h-10 mx-auto mb-4 text-slate-600" />
          <div className="text-slate-400 font-medium mb-1">当前无活跃会话</div>
          <div className="text-xs text-slate-600">15 分钟内无 Agent 活动</div>
        </div>
      )}

      {/* User Sessions */}
      {userSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            用户会话 ({userSessions.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {userSessions.map((session, idx) => {
              const agent = agentMap.get(session.agentId) || { emoji: '🤖', name: session.agentName };
              const ChannelIcon = channelIcons[session.channel] || Globe;
              const isWaiting = !session.systemSent && session.status !== 'done';

              return (
                <SessionCard
                  key={session.sessionKey}
                  session={session}
                  agent={agent}
                  channelIcon={ChannelIcon}
                  isWaiting={isWaiting}
                  now={now}
                  idx={idx}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Cron Sessions */}
      {cronSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-amber-400" />
            定时任务会话 ({cronSessions.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {cronSessions.map((session, idx) => {
              const agent = agentMap.get(session.agentId) || { emoji: '🤖', name: session.agentName };
              return (
                <SessionCard
                  key={session.sessionKey}
                  session={session}
                  agent={agent}
                  now={now}
                  idx={idx}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  agent,
  channelIcon: ChannelIcon,
  isWaiting,
  now,
  idx,
}: {
  session: ActiveSession;
  agent: { emoji: string; name: string };
  channelIcon?: React.ElementType;
  isWaiting?: boolean;
  now: number;
  idx: number;
}) {
  const statusLabel = session.isCron
    ? session.label || session.sessionKey.split(':').pop()?.slice(0, 30) || 'Cron'
    : session.status === 'done'
    ? '已完成'
    : session.status === 'running'
    ? '运行中'
    : session.chatType || '对话';

  const isActive = session.status === 'running' || (!session.systemSent && session.status !== 'done');

  return (
    <div
      className={cn(
        'glass-card glass-card-hover rounded-xl p-5 animate-in fade-in',
        isActive && 'ring-1 ring-emerald-500/20'
      )}
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      {/* Top row: Agent + Status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-lg border border-white/[0.06] flex-shrink-0">
            {agent.emoji}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-100 text-sm truncate">{agent.name}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{session.agentId}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {session.isCron ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              <CalendarClock className="w-2.5 h-2.5 inline mr-1" />
              Cron
            </span>
          ) : (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium border',
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
            )}>
              {isActive ? (
                <><Zap className="w-2.5 h-2.5 inline mr-1" />活跃</>
              ) : (
                statusLabel
              )}
            </span>
          )}
        </div>
      </div>

      {/* Info rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {session.isCron ? '开始时间' : '最后活跃'}
          </span>
          <span className="text-slate-300 font-mono">
            {formatTime(session.updatedAtMs)}
            <span className="text-slate-500 ml-1.5">({formatAgo(session.updatedAtMs)})</span>
          </span>
        </div>

        {session.startedAtMs > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              持续时长
            </span>
            <span className={cn(
              'text-slate-300 font-mono',
              session.startedAtMs > 0 && (now - session.startedAtMs) > 300_000 && 'text-amber-400'
            )}>
              {durationMs(session.startedAtMs, session.updatedAtMs)}
            </span>
          </div>
        )}

        {session.model && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Cpu className="w-3 h-3" />
              模型
            </span>
            <span className="text-slate-400 font-mono truncate ml-2 max-w-[160px]">
              {session.model}
            </span>
          </div>
        )}

        {!session.isCron && ChannelIcon && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              渠道
            </span>
            <span className="text-slate-400 flex items-center gap-1">
              <ChannelIcon className="w-3 h-3" />
              {session.channel || 'direct'}
            </span>
          </div>
        )}
      </div>

      {/* Waiting indicator */}
      {isWaiting && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-[10px] text-indigo-400 font-medium">等待 AI 回复中...</span>
        </div>
      )}
    </div>
  );
}
