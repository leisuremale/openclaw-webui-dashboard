// Agent color palette. Centralized so callers (Overview, charts) all use
// the same hue for a given agent id. Missing ids fall back to slate-500.

export const AGENT_COLORS: Record<string, string> = {
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

export const AGENT_COLOR_FALLBACK = '#64748b';

export function agentColor(id: string): string {
  return AGENT_COLORS[id] ?? AGENT_COLOR_FALLBACK;
}
