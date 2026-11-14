export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export function ago(ts) {
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return d + ' days ago';
  return new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function tcLabel(tc) {
  if (!tc) return '';
  if (tc.includes('/')) {
    const d = Number(tc.split('/')[1]) / 86400;
    return d + (d > 1 ? ' days' : ' day');
  }
  const [b, inc] = tc.split('+');
  const m = Number(b) / 60;
  const base = m >= 1 ? (Number.isInteger(m) ? m : m.toFixed(1)) + ' min' : b + ' sec';
  return base + (inc ? ' | ' + inc : '');
}

export function fmtEval(e) {
  if (!e) return '…';
  if (e.mate != null) return (e.mate > 0 ? '+' : '-') + 'M' + Math.abs(e.mate);
  const v = e.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
