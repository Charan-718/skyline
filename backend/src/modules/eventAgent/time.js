// Local wall-clock time <-> UTC instants for the club's time zone (APP_TIMEZONE, IST by default).
// The model only ever returns local "YYYY-MM-DD" and "HH:mm" strings taken from the calendar we
// give it; every conversion and every date comparison happens here, never in the model.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

function partsIn(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function offsetMs(instant, timeZone) {
  const p = partsIn(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDate(date) {
  const m = DATE_RE.exec(date ?? '');
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export const isValidTime = (time) => TIME_RE.test(time ?? '');

/** Local date + time in `timeZone` -> Date (UTC instant), or null when either part is invalid. */
export function localToUtc(date, time, timeZone) {
  if (!isValidDate(date) || !isValidTime(time)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Instant -> { date: 'YYYY-MM-DD', time: 'HH:mm' } in `timeZone`. */
export function utcToLocal(instant, timeZone) {
  const p = partsIn(new Date(instant), timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function addDays(date, days) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "Sun, 12 Oct 2026, 6:00 pm IST" */
export function formatLocal(instant, timeZone) {
  if (instant == null) return null;
  const d = new Date(instant);
  const text = new Intl.DateTimeFormat('en-IN', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  const zone = new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  return `${text.replace(/,(?=\s\d{4})/, '')} ${zone}`;
}

/** Lookup table for the model: "2026-10-12 Monday (tomorrow)". The model reads dates; it never computes them. */
export function calendarLines(now, timeZone, days = 60) {
  const today = utcToLocal(now, timeZone).date;
  const lines = [];
  for (let i = -1; i < days; i += 1) {
    const date = addDays(today, i);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${date}T00:00:00Z`));
    const tag = i === -1 ? ' (yesterday)' : i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : i === 2 ? ' (day after tomorrow)' : '';
    lines.push(`${date} ${weekday}${tag}`);
  }
  return lines;
}
