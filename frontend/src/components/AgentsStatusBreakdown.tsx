import { memo } from 'react';
import { MessageSquare, Zap, Clock } from 'lucide-react';
import { formatDuration } from '../lib/utils';

interface DayEntry {
  id: string;
  messages: number;
  tokens: number;
  rt: number;
}

interface DailyBreakdown {
  days: { date: string; entries: DayEntry[] }[];
  globalMaxMsg: number;
  globalMaxTok: number;
  globalMaxRt: number;
}

interface AgentInfo {
  name: string;
  emoji: string;
  color: string;
}

interface Props {
  dailyBreakdown: DailyBreakdown;
  agentInfo: Map<string, AgentInfo>;
}

/**
 * Extracted from Overview.tsx so the 15s overview poll does not force a
 * re-render of three SVG charts. Wrapped in React.memo: as long as the
 * dailyBreakdown / agentInfo references are stable (they derive from
 * metricsData, which only loads once), this component is render-frozen.
 */
function AgentsStatusBreakdownImpl({ dailyBreakdown, agentInfo }: Props) {
  const { days, globalMaxMsg, globalMaxTok, globalMaxRt } = dailyBreakdown;
  if (days.length === 0) {
    return (
      <div className="px-5 pb-5 border-t border-white/[0.04]">
        <div className="pt-4 text-center py-6 text-xs text-slate-600">暂无数据</div>
      </div>
    );
  }

  const dayCount = days.length;
  const maxAgentsPerDay = Math.max(1, ...days.map((d) => d.entries.length));
  const barW = 18;
  const barGap = 3;
  const groupW = Math.max(80, maxAgentsPerDay * (barW + barGap) + 4);
  const groupGap = 1;
  const chartW = dayCount * (groupW + groupGap);
  const barH = 110;
  const padTop = 16;
  const svgW = chartW + 32;
  const svgH = barH + padTop + 24;

  // Per-agent index lookup so connecting lines (response-time chart) stay
  // consistent across days.
  const allAgentIds = [...new Set(days.flatMap((d) => d.entries.map((e) => e.id)))].sort();

  const fallback: AgentInfo = { name: '', emoji: '🤖', color: '#64748b' };

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
              {[0, 0.5, 1].map((t) => {
                const y = barH * (1 - t);
                return (
                  <line
                    key={t}
                    x1={0}
                    x2={chartW}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.04)"
                    strokeDasharray="2 2"
                  />
                );
              })}
              {days.map((day, di) => {
                const gx = di * (groupW + groupGap);
                const sorted = [...day.entries]
                  .filter((e) => e.messages > 0)
                  .sort((a, b) => b.messages - a.messages);
                const totalBarsW = sorted.length * barW + (sorted.length - 1) * barGap;
                const startX = (groupW - totalBarsW) / 2;
                return (
                  <g key={day.date} transform={`translate(${gx},0)`}>
                    <text x={groupW / 2} y={barH + 14} textAnchor="middle" fill="#475569" fontSize="10">
                      {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                    </text>
                    {sorted.map((entry, ai) => {
                      const info = agentInfo.get(entry.id) || { ...fallback, name: entry.id };
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
              {[0, 0.5, 1].map((t) => {
                const y = barH * (1 - t);
                return (
                  <line
                    key={t}
                    x1={0}
                    x2={chartW}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.04)"
                    strokeDasharray="2 2"
                  />
                );
              })}
              {days.map((day, di) => {
                const gx = di * (groupW + groupGap);
                const sorted = [...day.entries]
                  .filter((e) => e.tokens > 0)
                  .sort((a, b) => b.tokens - a.tokens);
                const totalBarsW = sorted.length * barW + (sorted.length - 1) * barGap;
                const startX = (groupW - totalBarsW) / 2;
                return (
                  <g key={day.date} transform={`translate(${gx},0)`}>
                    <text x={groupW / 2} y={barH + 14} textAnchor="middle" fill="#475569" fontSize="10">
                      {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                    </text>
                    {sorted.map((entry, ai) => {
                      const info = agentInfo.get(entry.id) || { ...fallback, name: entry.id };
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
              {[0, 0.5, 1].map((t) => {
                const y = barH * (1 - t);
                return (
                  <line
                    key={t}
                    x1={0}
                    x2={chartW}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.04)"
                    strokeDasharray="2 2"
                  />
                );
              })}
              {/* Per-agent connecting line across days. */}
              {allAgentIds.map((aid) => {
                const info = agentInfo.get(aid) || { ...fallback, name: aid };
                const pts: [number, number][] = [];
                days.forEach((day, di) => {
                  const entry = day.entries.find((e) => e.id === aid && e.rt > 0);
                  if (entry) {
                    const gx = di * (groupW + groupGap);
                    const sorted = day.entries.filter((e) => e.rt > 0);
                    const totalW = sorted.length * barW + (sorted.length - 1) * barGap;
                    const startX = (groupW - totalW) / 2;
                    const idx = sorted.findIndex((e) => e.id === aid);
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
                    points={pts.map((p) => p.join(',')).join(' ')}
                    fill="none"
                    stroke={info.color}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                );
              })}
              {days.map((day, di) => {
                const gx = di * (groupW + groupGap);
                const sorted = [...day.entries]
                  .filter((e) => e.rt > 0)
                  .sort((a, b) => b.rt - a.rt);
                const totalW = sorted.length * barW + (sorted.length - 1) * barGap;
                const startX = (groupW - totalW) / 2;
                return (
                  <g key={day.date} transform={`translate(${gx},0)`}>
                    <text x={groupW / 2} y={barH + 14} textAnchor="middle" fill="#475569" fontSize="10">
                      {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                    </text>
                    {sorted.map((entry, ai) => {
                      const info = agentInfo.get(entry.id) || { ...fallback, name: entry.id };
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
}

export const AgentsStatusBreakdown = memo(AgentsStatusBreakdownImpl);
