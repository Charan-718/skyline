const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const toDate = (v) => (v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v));

export const formatDate = (v) => (v ? dateFmt.format(toDate(v)) : '–');
export const formatDateTime = (v) => (v ? dateTimeFmt.format(toDate(v)) : '–');
export const formatTime = (v) => (v ? timeFmt.format(toDate(v)) : '–');
export const formatMonth = (ym) => (ym ? monthFmt.format(new Date(`${ym}-01T00:00:00`)) : '');

export function formatRelative(v) {
  if (!v) return '–';
  const diff = toDate(v).getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60000) return 'just now';
  if (abs < 3600000) return rtf.format(Math.round(diff / 60000), 'minute');
  if (abs < 86400000) return rtf.format(Math.round(diff / 3600000), 'hour');
  if (abs < 30 * 86400000) return rtf.format(Math.round(diff / 86400000), 'day');
  return formatDate(v);
}

export function dateParts(v) {
  const d = toDate(v);
  return { day: d.getDate(), month: d.toLocaleString('en-IN', { month: 'short' }) };
}

/** ISO instant → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
export const todayInput = () => toLocalInput(new Date().toISOString()).slice(0, 10);

/** "1 event", "3 events". */
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
