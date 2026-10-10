import { z } from 'zod';

// Business dates are calendar dates (YYYY-MM-DD) in APP_TIMEZONE (IST); instants are Date.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value) {
  const m = ISO_DATE.exec(value ?? '');
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export const isoDateSchema = z.string().refine(isValidIsoDate, 'expected a valid date YYYY-MM-DD');

/** Normalize a Postgres `date` (Date) or ISO date string to `YYYY-MM-DD`. */
export function toIsoDateString(value) {
  if (value == null || value === '') return value;
  if (typeof value === 'string' && isValidIsoDate(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid date ${value}`);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const out = `${y}-${mo}-${day}`;
  if (!isValidIsoDate(out)) throw new RangeError(`invalid date ${value}`);
  return out;
}

/** ISO-8601 instant with an explicit offset (e.g. 2026-11-20T18:00:00+05:30 or ...Z). */
export const instantSchema = z.string().datetime({ offset: true }).transform((v) => new Date(v));

function offsetMinutes(instant, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName').value; // "GMT+5:30" | "GMT"
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** 00:00 of `date` in `timeZone`, as an instant. */
export function startOfDay(date, timeZone) {
  if (!isValidIsoDate(date)) throw new RangeError(`invalid date ${date}`);
  const [y, mo, d] = date.split('-').map(Number);
  const utcMidnight = Date.UTC(y, mo - 1, d);
  return new Date(utcMidnight - offsetMinutes(new Date(utcMidnight), timeZone) * 60_000);
}

/** date + n days (calendar arithmetic). */
export function addDays(date, n) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}
