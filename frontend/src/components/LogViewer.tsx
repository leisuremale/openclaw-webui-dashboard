import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { Terminal, RefreshCw, AlertTriangle, AlertCircle, Info, Clock, Zap, ChevronDown, ChevronRight } from 'lucide-react';

interface LogInsight {
  type: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  agentId?: string;
  agentName?: string;
  maxAge?: number;
  count?: number;
  lastSeen?: string;
  diagId?: string;
  line?: string;
}

interface LogAnalysis {
  insights: LogInsight[];
  stats: Record<string, number>;
  sources: string[];
}

interface LogViewerProps {
  onBack?: () => void;
}

async function fetchLogs(type: string): Promise<string[]> {
  const base = import.meta.env.PROD ? '' : '';
  const res = await fetch(`${base}/api/logs/${type}?lines=500`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.lines || [];
}

function highlightLine(line: string): { text: string; className: string } {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('exception') || lower.includes('traceback') || lower.includes('fail')) {
    return { text: line, className: 'text-rose-400' };
  }
  if (lower.includes('warning') || lower.includes('warn')) {
    return { text: line, className: 'text-amber-400' };
  }
  if (lower.includes('stuck session')) {
    return { text: line, className: 'text-orange-400 font-medium' };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { text: line, className: 'text-amber-300' };
  }
  if (lower.includes('started') || lower.includes('running') || lower.includes('complete')) {
    return { text: line, className: 'text-emerald-400' };
  }
  return { text: line, className: '' };
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

const severityConfig: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  error: { icon: AlertCircle, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/25' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/25' },
};

export function LogViewer(_props: LogViewerProps) {
  const [activeTab, setActiveTab] = useState<'stdout' | 'stderr'>('stderr');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    fetchLogs(activeTab).then((l) => {
      setLines(l);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const loadAnalysis = () => {
    api.logAnalysis().then((a: LogAnalysis) => setAnalysis(a)).catch(() => {});
  };

  useEffect(() => {
    load();
    loadAnalysis();
    const iv = setInterval(() => { load(); loadAnalysis(); }, 10000);
    return () => clearInterval(iv);
  }, [activeTab]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-slate-100">系统日志</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'text-[10px] px-2 py-1 rounded border transition-all',
              autoScroll
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                : 'border-white/[0.06] text-slate-500'
            )}
          >
            自动滚动: {autoScroll ? '开' : '关'}
          </button>
          <button
            onClick={() => { load(); loadAnalysis(); }}
            className="p-2 rounded-lg hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 transition-colors"
            title="刷新"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Insights Panel */}
      {analysis && analysis.insights.length > 0 && (
        <div className="flex-shrink-0">
          <button
            onClick={() => setInsightsOpen(!insightsOpen)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"
          >
            {insightsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Zap className="w-3 h-3 text-indigo-400" />
            日志洞察
            <span className="text-[10px] text-slate-600 ml-1">
              {analysis.insights.length} 项发现
            </span>
          </button>

          {insightsOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-auto">
              {/* Quick stats */}
              {Object.keys(analysis.stats).length > 0 && (
                <div className="glass-card rounded-lg p-3 flex flex-wrap gap-2 items-center col-span-full">
                  {analysis.stats.stuck_sessions && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      🔴 {analysis.stats.stuck_sessions} 次卡住
                    </span>
                  )}
                  {analysis.stats.errors && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      ❌ {analysis.stats.errors} 个错误
                    </span>
                  )}
                  {analysis.stats.warnings && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      ⚠️ {analysis.stats.warnings} 个警告
                    </span>
                  )}
                  {analysis.stats.llm_timeouts && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      ⏱️ {analysis.stats.llm_timeouts} 次LLM超时
                    </span>
                  )}
                  {analysis.stats.restarts && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      🔄 {analysis.stats.restarts} 次重启
                    </span>
                  )}
                  {Object.entries(analysis.stats)
                    .filter(([k]) => k.startsWith('http_'))
                    .map(([k, v]) => (
                      <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        🌐 HTTP {k.replace('http_', '')}: {v}
                      </span>
                    ))}
                </div>
              )}

              {/* Individual insights */}
              {analysis.insights.slice(0, 8).map((insight, idx) => {
                const cfg = severityConfig[insight.severity];
                const Icon = cfg.icon;
                const isStuck = insight.type === 'stuck_session';
                return (
                  <div
                    key={idx}
                    className={cn(
                      'glass-card rounded-lg p-3 border',
                      cfg.bg
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', cfg.color)} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-xs font-medium', cfg.color)}>
                            {insight.title}
                          </span>
                          {isStuck && insight.maxAge && (
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {formatSeconds(insight.maxAge)}
                            </span>
                          )}
                          {insight.lastSeen && (
                            <span className="text-[9px] text-slate-600">
                              {insight.lastSeen.slice(11, 19)}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                          {insight.detail}
                        </div>
                        {insight.line && (
                          <div className="text-[9px] text-slate-600 mt-1 font-mono truncate opacity-60">
                            {insight.line.slice(0, 150)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-0.5 w-fit">
        {(['stdout', 'stderr'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-medium transition-all',
              activeTab === tab
                ? 'bg-white/[0.06] text-slate-200'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {tab === 'stdout' ? '📤 stdout' : '⚠️ stderr'}
          </button>
        ))}
      </div>

      {/* Log display */}
      <div
        ref={containerRef}
        className="flex-1 glass-card rounded-xl p-4 overflow-auto font-mono text-xs leading-relaxed"
        onScroll={() => {
          if (!containerRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
          setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
        }}
      >
        {loading && lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
            加载中...
          </div>
        ) : lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            暂无日志
          </div>
        ) : (
          <div className="space-y-0">
            {lines.map((line, i) => {
              const { text, className } = highlightLine(line);
              return (
                <div
                  key={i}
                  className={cn(
                    'py-0.5 hover:bg-white/[0.02] transition-colors',
                    className || 'text-slate-400'
                  )}
                >
                  <span className="text-slate-600 select-none mr-3 inline-block w-6 text-right text-[10px]">
                    {i + 1}
                  </span>
                  {text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
