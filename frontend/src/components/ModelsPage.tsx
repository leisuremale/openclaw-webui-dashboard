import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Cpu, Globe, Zap, ExternalLink, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';

interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
}

interface ProviderInfo {
  provider: string;
  baseUrl: string;
  models: ModelInfo[];
}

interface AgentLite {
  id: string;
  _displayName: string;
  _model_display: string;
  _provider: string;
}

interface UsageInfo {
  plan?: string;
  quota_calls?: number;
  quota_hours?: number;
  used_percent?: number;
  total_credit?: number;
  balance?: number;
  voice_used_percent?: number;
  updated_at?: number;
  error?: string | null;
  page_percents_found?: number[];
}

type ModelUsage = Record<string, UsageInfo>;

const providerMeta: Record<string, { color: string; label: string }> = {
  minimax: { color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/25 text-emerald-300', label: 'Minimax' },
  moonshot: { color: 'from-violet-500/20 to-purple-500/20 border-violet-500/25 text-violet-300', label: 'Moonshot' },
  qwen: { color: 'from-amber-500/20 to-orange-500/20 border-amber-500/25 text-amber-300', label: '通义千问' },
  deepseek: { color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/25 text-blue-300', label: 'DeepSeek' },
  volcengine: { color: 'from-rose-500/20 to-pink-500/20 border-rose-500/25 text-rose-300', label: '火山引擎' },
  'volcengine-plan': { color: 'from-rose-500/20 to-pink-500/20 border-rose-500/25 text-rose-300', label: '火山 Plan' },
};

function formatContextWindow(k?: number): string {
  if (!k) return '—';
  if (k >= 1000_000) return `${(k / 1000_000).toFixed(0)}M`;
  if (k >= 1000) return `${(k / 1000).toFixed(0)}K`;
  return `${k}`;
}

async function fetchModels(): Promise<ProviderInfo[]> {
  const base = import.meta.env.PROD ? '' : '';
  const res = await fetch(`${base}/api/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAgents(): Promise<AgentLite[]> {
  const base = import.meta.env.PROD ? '' : '';
  const res = await fetch(`${base}/api/agents`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ModelsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [agentUsage, setAgentUsage] = useState<Record<string, AgentLite[]>>({});
  const [modelUsage, setModelUsage] = useState<ModelUsage>({});
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchModels(), fetchAgents(), api.modelUsage()]).then(([ps, ags, usage]) => {
      setProviders(ps);
      const agUsage: Record<string, AgentLite[]> = {};
      ags.forEach((a: AgentLite) => {
        if (!agUsage[a._provider]) agUsage[a._provider] = [];
        agUsage[a._provider].push(a);
      });
      setAgentUsage(agUsage);
      setModelUsage(usage || {});
      setLoading(false);
    });
  }, []);

  const refreshUsage = async (provider: string) => {
    setRefreshing(provider);
    try {
      await api.refreshUsage(provider);
      // Reload usage data after refresh
      const usage = await api.modelUsage();
      setModelUsage(usage || {});
    } catch {
      // silent
    } finally {
      setRefreshing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100">{providers.length}</div>
            <div className="text-[11px] text-slate-500">Providers</div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100">
              {providers.reduce((sum, p) => sum + p.models.length, 0)}
            </div>
            <div className="text-[11px] text-slate-500">可用模型</div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Globe className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100">
              {Object.values(agentUsage).reduce((sum, ags) => sum + ags.length, 0)}
            </div>
            <div className="text-[11px] text-slate-500">Agent 已配置</div>
          </div>
        </div>
      </div>

      {/* Usage Overview */}
      {Object.keys(modelUsage).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              用量概览
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(modelUsage).map(([provider, info]) => {
              if (!info || info.error) return null;
              const isRefreshing = refreshing === provider;
              const meta = providerMeta[provider] || { color: '', label: provider };
              const pct = info.voice_used_percent ?? info.used_percent ?? 0;
              const hasData = (info.quota_calls ?? 0) > 0 || pct > 0;

              return (
                <div key={provider} className="glass-card rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-xs font-bold',
                        meta.color || 'bg-indigo-500/10 text-indigo-400'
                      )}>
                        {info.plan ? info.plan.charAt(0) : provider.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-200">
                          {meta.label || provider}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {info.plan || '—'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => refreshUsage(provider)}
                      disabled={!!isRefreshing}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-indigo-400 transition-colors disabled:opacity-50"
                      title="刷新用量数据"
                    >
                      <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
                    </button>
                  </div>

                  {hasData ? (
                    <div className="space-y-2">
                      {/* Balance-style (DeepSeek) */}
                      {info.balance !== undefined && info.balance !== null ? (
                        <div>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-slate-500">充值余额</span>
                          </div>
                          <div className="text-xl font-bold text-slate-100">
                            ¥{info.balance.toFixed(2)}
                          </div>
                        </div>
                      ) : (info.quota_calls ?? 0) > 0 ? (
                        /* Quota-style (Minimax) */
                        <div>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-slate-500">模型调用</span>
                            <span className="text-slate-400">{info.quota_calls}次 / {info.quota_hours}小时</span>
                          </div>
                          {pct > 0 && (
                            <div className="w-full h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                )}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          )}
                          <div className="flex justify-between text-[10px] mt-1">
                            <span className="text-slate-600">
                              {pct > 0 ? `${pct}% 已使用` : '用量未知'}
                            </span>
                            {info.total_credit !== undefined && info.total_credit > 0 && (
                              <span className="text-slate-500">余额 ¥{info.total_credit}</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-600 italic flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      暂无用量数据，点击刷新获取
                    </div>
                  )}

                  {info.updated_at && (
                    <div className="mt-2 text-[9px] text-slate-600 text-right">
                      更新于 {new Date(info.updated_at * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Provider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {providers.map((p) => {
          const meta = providerMeta[p.provider] || { color: 'from-slate-500/20 to-slate-600/20 border-slate-500/25 text-slate-300', label: p.provider };
          const agents = agentUsage[p.provider] || [];
          return (
            <div
              key={p.provider}
              className={cn(
                'glass-card rounded-xl border bg-gradient-to-br overflow-hidden',
                meta.color
              )}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{meta.label}</div>
                    <div className="text-[10px] opacity-70 font-mono">{p.provider}</div>
                  </div>
                </div>
                {p.baseUrl && (
                  <a
                    href={p.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] bg-black/20 px-2 py-1 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="w-3 h-3" />
                    API
                  </a>
                )}
              </div>

              {/* Models table */}
              <div className="px-4 py-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="text-left py-2 px-1 text-[10px] font-medium text-slate-500 w-8">#</th>
                      <th className="text-left py-2 px-1 text-[10px] font-medium text-slate-500">模型</th>
                      <th className="text-right py-2 px-1 text-[10px] font-medium text-slate-500">上下文</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.models.map((m, i) => (
                      <tr key={m.id} className="border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 px-1 text-[11px] text-slate-600 font-mono">{i + 1}</td>
                        <td className="py-2 px-1">
                          <div className="text-xs text-slate-200">{m.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{m.id}</div>
                        </td>
                        <td className="py-2 px-1 text-right text-xs text-slate-400 font-mono">
                          {formatContextWindow(m.contextWindow)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Agent assignment */}
              {agents.length > 0 && (
                <div className="px-5 py-3 border-t border-white/[0.06]">
                  <div className="text-[10px] text-slate-500 mb-2">使用此 Provider 的 Agent</div>
                  <div className="flex flex-wrap gap-1.5">
                    {agents.map((a) => (
                      <span
                        key={a.id}
                        className="text-[10px] px-2 py-1 rounded-full bg-black/20 text-slate-300 font-medium"
                      >
                        {a._displayName}
                        <span className="text-slate-500 ml-1">({a._model_display})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
