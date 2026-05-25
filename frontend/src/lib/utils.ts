import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

export function formatTime(ts?: number): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
}

/**
 * Compact count formatting: 1500 → "2K", 1_500_000 → "2M".
 * Used for context windows (M tokens) and large message totals.
 * `undefined`/`0` returns an em-dash.
 */
export function formatCount(n?: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

/**
 * Numeric semver compare: returns -1, 0, or 1.
 * Strips any pre-release suffix (the "-rc.1" / "+build") and compares the
 * dot-separated numeric segments. "2.10.0" > "2.9.0" — which a naive
 * string compare gets wrong.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((x) => Number.parseInt(x, 10) || 0);
  const ap = parse(a);
  const bp = parse(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const d = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
