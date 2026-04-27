import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Layers, FileText, FolderOpen, Search, ExternalLink, Clock } from 'lucide-react';

interface Skill {
  name: string;
  source: string;
  path: string;
  description: string;
  keywords?: string;
  lastUpdatedMs?: number;
}

interface Agent {
  id: string;
  name?: string;
  identity?: { emoji?: string; name?: string };
  _displayName: string;
}

const API_BASE = import.meta.env.PROD ? '' : '';

async function openInFinder(path: string) {
  try {
    await fetch(`${API_BASE}/api/open-path?path=${encodeURIComponent(path)}`);
  } catch {
    // silent fail
  }
}

function shortenPath(path: string): string {
  const home = '/Users/';
  const idx = path.indexOf(home);
  if (idx !== -1) {
    const afterHome = path.slice(idx + home.length);
    const slashIdx = afterHome.indexOf('/');
    if (slashIdx !== -1) {
      return `~/${afterHome.slice(slashIdx + 1)}`;
    }
  }
  // Fallback: show last 3 segments
  const parts = path.split('/');
  return '.../' + parts.slice(-3).join('/');
}

function formatLastUpdated(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const now = Date.now();
  const diff = now - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚更新';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SkillsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skillsMap, setSkillsMap] = useState<Record<string, Skill[]>>({});
  const [loadingCounts, setLoadingCounts] = useState<Set<string>>(new Set());
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Load agents and preload all skill counts
  useEffect(() => {
    api.agents().then((ags: Agent[]) => {
      setAgents(ags);
      if (ags.length > 0) setActiveAgent(ags[0].id);
      // Preload skills for ALL agents to show counts
      const ids = new Set(ags.map((a) => a.id));
      setLoadingCounts(ids);
      Promise.all(
        ags.map((a) =>
          api.skills(a.id).then((skills: Skill[]) => {
            setSkillsMap((prev) => ({ ...prev, [a.id]: skills }));
          }).catch(() => {})
        )
      ).finally(() => setLoadingCounts(new Set()));
    });
  }, []);

  // Load active agent skills on demand (in case not preloaded)
  useEffect(() => {
    if (!activeAgent) return;
    if (skillsMap[activeAgent]) return;
    setLoadingCounts((prev) => new Set(prev).add(activeAgent));
    api.skills(activeAgent).then((skills: Skill[]) => {
      setSkillsMap((prev) => ({ ...prev, [activeAgent]: skills }));
      setLoadingCounts((prev) => {
        const next = new Set(prev);
        next.delete(activeAgent);
        return next;
      });
    });
  }, [activeAgent]);

  const currentSkills = activeAgent ? skillsMap[activeAgent] || [] : [];

  const filteredSkills = useMemo(() => {
    if (!search) return currentSkills;
    const q = search.toLowerCase();
    return currentSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.keywords || '').toLowerCase().includes(q)
    );
  }, [currentSkills, search]);

  const totalSkillsCount = Object.values(skillsMap).reduce((sum, s) => sum + s.length, 0);

  const handleOpenPath = useCallback((path: string) => {
    openInFinder(path);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Agent List */}
      <div className="lg:w-56 flex-shrink-0">
        <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 px-2">
          Agent ({agents.length})
        </div>
        <div className="space-y-0.5 max-h-[calc(100vh-16rem)] overflow-y-auto lg:max-h-none">
          {agents.map((agent) => {
            const count = skillsMap[agent.id]?.length;
            const isLoading = loadingCounts.has(agent.id) && count === undefined;
            const active = activeAgent === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => setActiveAgent(agent.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150',
                  active
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0">{agent.identity?.emoji || '🤖'}</span>
                  <span className="truncate">{agent._displayName}</span>
                </span>
                <span className={cn(
                  'text-[10px] font-mono flex-shrink-0 ml-2 min-w-[1em] text-right',
                  active ? 'text-indigo-400' : count !== undefined ? 'text-slate-500' : 'text-slate-700'
                )}>
                  {isLoading ? '·' : count !== undefined ? count : '0'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Skills Area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header + Search */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Skills
            <span className="text-[11px] font-normal text-slate-500 ml-1">
              ({filteredSkills.length} 个)
            </span>
            <span className="text-[10px] font-normal text-slate-600 bg-white/[0.03] px-1.5 py-0.5 rounded">
              总计 {totalSkillsCount}
            </span>
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="搜索 skill..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg py-1.5 pl-7 pr-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all"
            />
          </div>
        </div>

        {/* Skills Grid */}
        <div className="flex-1 overflow-auto">
          {currentSkills.length === 0 && skillsMap[activeAgent || ''] !== undefined ? (
            <div className="glass-card rounded-xl p-12 text-center text-slate-500">
              <Layers className="w-8 h-8 mx-auto mb-3 opacity-30" />
              该 Agent 暂无 Skills
            </div>
          ) : filteredSkills.length === 0 && search ? (
            <div className="glass-card rounded-xl p-12 text-center text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
              没有匹配的 Skill
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredSkills.map((skill, idx) => (
                <div
                  key={skill.name}
                  className="glass-card glass-card-hover rounded-lg p-4 flex items-start gap-3 animate-in fade-in"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    skill.source === 'agent' ? 'bg-indigo-500/10' : 'bg-emerald-500/10'
                  )}>
                    <FileText className={cn(
                      'w-4 h-4',
                      skill.source === 'agent' ? 'text-indigo-400' : 'text-emerald-400'
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200 text-sm">{skill.name}</span>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded border',
                        skill.source === 'agent'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      )}>
                        {skill.source === 'agent' ? '内置' : '工作区'}
                      </span>
                    </div>
                    {skill.description ? (
                      <div className="text-xs text-slate-400 mt-1 line-clamp-2">{skill.description}</div>
                    ) : (
                      <div className="text-xs text-slate-600/50 mt-1 italic">暂无说明</div>
                    )}
                    {skill.keywords && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {skill.keywords.split(/[,，、\s]+/).filter(Boolean).slice(0, 5).map((kw, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400/80 border border-indigo-500/20"
                          >
                            {kw.replace(/^[""](.+?)[""]$/, '$1')}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPath(skill.path);
                      }}
                      className="flex items-center gap-1 mt-2 text-[10px] text-slate-500 hover:text-indigo-400 font-mono transition-colors group/link cursor-pointer"
                      title="在 Finder 中打开"
                    >
                      <FolderOpen className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{shortenPath(skill.path)}</span>
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                    </button>
                    {skill.lastUpdatedMs && skill.lastUpdatedMs > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-600">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span>最后更新：{formatLastUpdated(skill.lastUpdatedMs)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

