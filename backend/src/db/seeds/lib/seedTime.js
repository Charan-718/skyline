/** Relative instants aligned with frontend `src/api/mock/domain.js` (`daysFromNow`). */
const DAY_MS = 86400000;

export function daysFromNow(days, hour = 10) {
  const t = new Date(Date.now() + days * DAY_MS);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
}

export function dateOnly(iso) {
  return iso.slice(0, 10);
}

export function todayCalendar() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
