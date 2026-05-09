import { useEffect, useState } from 'react';
import { api, isAbort } from '../lib/api';
import { cn, formatDuration } from '../lib/utils';
import {
  X,
  BarChart3,
} from 'lucide-react';
import { AgentMetricsChart } from './AgentMetricsChart';
import type { AgentMetricSummary } from '../lib/types';
import { ChartGridLines } from './chart-utils';
import { formatDayLabel, isTodayIso } from '../lib/chart-utils';

interface AgentsComparisonModalProps {
  onClose: () => void;
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

export function AgentsComparisonModal({ onClose }: AgentsComparisonModalProps) {
  const [data, setData] = useState<AgentMetricSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentMetricSummary | null>(null);
  const [hiddenAgents, setHiddenAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ac = new AbortController();
    api.agentsMetrics({ signal: ac.signal })
      .then((d) => {
        if (ac.signal.aborted) return;
        setData(d || []);
        setLoading(false);
      })
      .catch((err) => {
        if (isAbort(err)) return;
        console.warn('agentsMetrics load failed:', err);
        setLoading(false);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedAgent) setSelectedAgent(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, selectedAgent]);

  const visibleAgents = data.filter((a) => !hiddenAgents.has(a.id));
  const toggleAgent = (id: string) => {
    setHiddenAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      onClick={() => {
        if (selectedAgent) setSelectedAgent(null);
        else onClose();
      }}
    >
      <div
        className="glass-card rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl border border-white/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 text-sm">
                {selectedAgent ? `${selectedAgent.name} 近 7 天详情` : 'Agent 性能对比'}
              </div>
              <div className="text-[11px] text-slate-500">
                {selectedAgent ? '点击空白处返回对比视图' : '各 Agent 近 7 天消息量、Token 用量与响应时间'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedAgent && (
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded hover:bg-white/[0.04]"
              >
                ← 返回对比
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-white/[0.03]" />
              ))}
            </div>
          )}

          {!loading && selectedAgent && (
            <AgentMetricsChart daily={selectedAgent.daily} />
          )}

          {!loading && !selectedAgent && data.length === 0 && (
            <div className="text-center py-10 text-sm text-slate-500">暂无数据</div>
          )}

          {!loading && !selectedAgent && data.length > 0 && (
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex flex-wrap gap-2">
                {data.map((agent) => {
                  const hidden = hiddenAgents.has(agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-all',
                        hidden
                          ? 'text-slate-600 border-white/[0.04] opacity-40'
                          : 'text-slate-300 border-white/[0.08] hover:border-white/[0.15]'
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: AGENT_COLORS[agent.id] || '#64748b' }}
                      />
                      <span>{agent.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Chart */}
              <ComparisonChart
                agents={visibleAgents}
                onSelectAgent={setSelectedAgent}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ComparisonChartProps {
  agents: AgentMetricSummary[];
  onSelectAgent: (agent: AgentMetricSummary) => void;
}

function ComparisonChart({ agents, onSelectAgent }: ComparisonChartProps) {
  if (agents.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-500">
        请在上方选择至少一个 Agent
      </div>
    );
  }

  // Assume all agents have same 7 daily slots
  const days = agents[0]?.daily.map((d) => d.date) || [];
  const dayCount = days.length;

  // Compute global max for normalization
  let globalMaxMessages = 1;
  let globalMaxTokens = 1;
  let globalMaxRt = 1;
  for (const agent of agents) {
    for (const d of agent.daily) {
      if (d.messages > globalMaxMessages) globalMaxMessages = d.messages;
      if (d.tokens > globalMaxTokens) globalMaxTokens = d.tokens;
      if (d.avgResponseTimeMs > globalMaxRt) globalMaxRt = d.avgResponseTimeMs;
    }
  }

  // Layout
  const groupWidth = 140;
  const groupGap = 16;
  const chartHeight = 220;
  const chartWidth = dayCount * (groupWidth + groupGap);
  const padding = { top: 10, right: 10, bottom: 32, left: 10 };

  const barW = 9;
  const barGap = 2;
  const totalBarsWidth = agents.length * barW + (agents.length - 1) * barGap;

  return (
    <div className="overflow-x-auto">
      <svg
        width={chartWidth + padding.left + padding.right}
        height={chartHeight + padding.top + padding.bottom}
        className="block"
      >
        <g transform={`translate(${padding.left},${padding.top})`}>
          <ChartGridLines width={chartWidth} height={chartHeight} ticks={[0, 0.25, 0.5, 0.75, 1]} />

          {/* Day groups */}
          {days.map((date, dayIdx) => {
            const gx = dayIdx * (groupWidth + groupGap);
            const dayLabel = formatDayLabel(date);
            const isToday = isTodayIso(date);

            // Find max messages for this day across visible agents (for optional day-local normalization)
            // Using global normalization for cross-day comparison

            return (
              <g key={date} transform={`translate(${gx},0)`}>
                {/* Day label */}
                <text
                  x={groupWidth / 2}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  fill={isToday ? '#818cf8' : '#64748b'}
                  fontSize="11"
                  fontWeight={isToday ? 600 : 400}
                >
                  {dayLabel}
                </text>

                {/* Agent bars centered in group */}
                {agents.map((agent, agentIdx) => {
                  const dayData = agent.daily[dayIdx];
                  if (!dayData) return null;

                  const bx = (groupWidth - totalBarsWidth) / 2 + agentIdx * (barW + barGap);
                  const msgH = (dayData.messages / globalMaxMessages) * chartHeight;
                  const tokH = (dayData.tokens / globalMaxTokens) * chartHeight * 0.5;
                  const color = AGENT_COLORS[agent.id] || '#64748b';

                  const hasRt = dayData.avgResponseTimeMs > 0;
                  const rtRadius = hasRt
                    ? 2 + (dayData.avgResponseTimeMs / globalMaxRt) * 3.5
                    : 0;

                  return (
                    <g key={agent.id} transform={`translate(${bx},0)`}>
                      {/* Message bar */}
                      <rect
                        x={0}
                        y={chartHeight - msgH}
                        width={barW}
                        height={msgH}
                        rx={1.5}
                        fill={color}
                        opacity={0.9}
                        className="cursor-pointer hover:opacity-100"
                        onClick={() => onSelectAgent(agent)}
                      />
                      {/* Token overlay (narrower, semi-transparent) */}
                      {dayData.tokens > 0 && (
                        <rect
                          x={2}
                          y={chartHeight - tokH}
                          width={barW - 4}
                          height={tokH}
                          rx={1}
                          fill="#ffffff"
                          opacity={0.25}
                          className="pointer-events-none"
                        />
                      )}
                      {/* Response time dot on top */}
                      {hasRt && (
                        <circle
                          cx={barW / 2}
                          cy={chartHeight - msgH - 4}
                          r={rtRadius}
                          fill="#fbbf24"
                          opacity={0.9}
                          className="pointer-events-none"
                        />
                      )}
                      <title>
                        {`${agent.name} · ${date}\n消息: ${dayData.messages}\nTokens: ${dayData.tokens.toLocaleString()}\n均响: ${dayData.avgResponseTimeMs > 0 ? formatDuration(dayData.avgResponseTimeMs) : '-'}`}
                      </title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend for metrics */}
      <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-2">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-400 inline-block" />
          消息量
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-white/30 inline-block" />
          Token 用量
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          响应时间
        </span>
        <span className="text-slate-600 ml-auto">点击柱状图查看该 Agent 每日详情</span>
      </div>
    </div>
  );
}
