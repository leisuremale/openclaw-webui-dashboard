// Pure helpers for SVG chart components.

export function formatDayLabel(date: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function isTodayIso(date: string): boolean {
  return date === new Date().toISOString().slice(0, 10);
}
