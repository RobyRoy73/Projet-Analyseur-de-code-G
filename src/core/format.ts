/** Formate un temps en minutes : « 45 s », « 3 min 18 s », « 1 h 05 min ». */
export function formatTime(minutes: number): string {
  const s = Math.round(minutes * 60);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(r).padStart(2, '0')} s`;
  return `${r} s`;
}

export const formatNumber = (v: number, digits = 1) =>
  v.toLocaleString('fr-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const percent = (part: number, total: number) => (total ? (part / total) * 100 : 0);

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
