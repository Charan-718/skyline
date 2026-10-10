// Injectable clock (NFR-14). Services take time from here, never from Date directly,
// so tests and dev jobs can run "as of" a given instant (tests/helpers/testClock.js).

export function isoDateInZone(instant, timeZone) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function createClock({ timeZone = 'Asia/Kolkata', nowFn = () => new Date() } = {}) {
  return {
    now: () => new Date(nowFn().getTime()),
    todayIST: () => isoDateInZone(nowFn(), timeZone),
    timeZone,
  };
}
