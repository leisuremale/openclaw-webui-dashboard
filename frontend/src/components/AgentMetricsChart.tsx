import { useMemo } from 'react';
import { formatDuration } from '../lib/utils';
import { BarChart3, Clock, MessageSquare, Zap } from 'lucide-react';

interface DailyMetric {
  date: string;
  messages: number;
  tokens: number;
  avgResponseTimeMs: number;
}

interface AgentMetricsChartProps {
  daily: DailyMetric[];
  showHeader?: boolean;
  height?: number;
}

export function AgentMetricsChart({ daily, showHeader = true, height = 140 }: AgentMetricsChartProps) {
  const hasData = daily.some((d) => d.messages > 0);

  const activeDays = daily.filter((d) => d.messages > 0);
  const totalMessages = activeDays.reduce((s, d) => s + d.messages, 0);
  const totalTokens = activeDays.reduce((s, d) => s + d.tokens, 0);
  const avgResponse = useMemo(() => {
    const vals = activeDays.map((d) => d.avgResponseTimeMs).filter((v) => v > 0);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  }, [activeDays]);

  // Chart dimensions
  const groupWidth = 36;
  const groupGap = 8;
  const chartWidth = daily.length * (groupWidth + groupGap);
  const chartHeight = height;
  const paddingLeft = 8;
  const paddingTop = 8;

  const maxMessages = Math.max(1, ...daily.map((d) => d.messages));
  const maxTokens = Math.max(1, ...daily.map((d) => d.tokens));
  const maxResponse = Math.max(1, ...daily.map((d) => d.avgResponseTimeMs));

  if (!hasData) {
    return (
      <div className="glass-card rounded-xl p-5 text-center text-slate-500 text-xs">
        <BarChart3 className="w-4 h-4 mx-auto mb-2 text-slate-600" />
        近 7 天内无对话数据
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            近 7 天趋势
          </h3>
          <div className="flex items-center gap-4">
            <StatBadge icon={MessageSquare} label="消息" value={`${totalMessages}`} />
            <StatBadge icon={Zap} label="Tokens" value={`${(totalTokens / 1000).toFixed(1)}k`} />
            {avgResponse > 0 && (
              <StatBadge icon={Clock} label="均响" value={formatDuration(avgResponse)} />
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <svg
          width={chartWidth + paddingLeft + 8}
          height={chartHeight + paddingTop + 28}
          className="block"
        >
          <g transform={`translate(${paddingLeft},${paddingTop})`}>
            {/* Grid lines */}
            {[0, 0.5, 1].map((t) => {
              const y = chartHeight * (1 - t);
              return (
                <line
                  key={t}
                  x1={0}
                  x2={chartWidth}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray={t === 0 ? undefined : '2 2'}
                />
              );
            })}

            {/* Bars + line */}
            {daily.map((d, i) => {
              const x = i * (groupWidth + groupGap);
              const barW = 12;
              const msgH = (d.messages / maxMessages) * chartHeight;
              const tokH = (d.tokens / maxTokens) * chartHeight;

              const rtY = chartHeight - (d.avgResponseTimeMs / maxResponse) * chartHeight;

              const isToday = d.date === new Date().toISOString().slice(0, 10);
              const dayLabel = `${new Date(d.date).getMonth() + 1}/${new Date(d.date).getDate()}`;

              return (
                <g key={d.date} transform={`translate(${x},0)`}>
                  {/* Message bar (left) */}
                  <rect
                    x={2}
                    y={chartHeight - msgH}
                    width={barW}
                    height={msgH}
                    rx={2}
                    fill={isToday ? '#818cf8' : '#6366f1'}
                    opacity={0.9}
                  />
                  {/* Token bar (right) */}
                  {d.tokens > 0 && (
                    <rect
                      x={2 + barW + 2}
                      y={chartHeight - tokH}
                      width={barW}
                      height={tokH}
                      rx={2}
                      fill="#34d399"
                      opacity={0.7}
                    />
                  )}
                  {/* Response time dot */}
                  {d.avgResponseTimeMs > 0 && (
                    <circle
                      cx={groupWidth / 2}
                      cy={rtY}
                      r={3}
                      fill="#fbbf24"
                      opacity={0.9}
                    />
                  )}
                  <title>
                    {`${d.date}\n消息: ${d.messages}\nTokens: ${d.tokens.toLocaleString()}\n均响: ${d.avgResponseTimeMs > 0 ? formatDuration(d.avgResponseTimeMs) : '-'}`}
                  </title>
                  <text
                    x={groupWidth / 2}
                    y={chartHeight + 16}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9"
                  >
                    {dayLabel}
                  </text>
                </g>
              );
            })}

            {/* Response time connecting line */}
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              opacity={0.7}
              points={daily
                .map((d, i) => {
                  if (d.avgResponseTimeMs <= 0) return null;
                  const x = i * (groupWidth + groupGap) + groupWidth / 2;
                  const y = chartHeight - (d.avgResponseTimeMs / maxResponse) * chartHeight;
                  return `${x},${y}`;
                })
                .filter(Boolean)
                .join(' ')}
            />
          </g>
        </svg>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />
          消息量
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />
          Token 用量
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          响应时间
        </span>
      </div>
    </div>
  );
}

function StatBadge({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon className="w-3 h-3 text-slate-500" />
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 font-medium">{value}</span>
    </div>
  );
}
