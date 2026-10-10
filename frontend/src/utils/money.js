// Money is integer paise everywhere (ADR-008). Conversion lives only here.
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

export function formatMoney(paise, { compact = false } = {}) {
  if (paise == null || Number.isNaN(paise)) return '–';
  const rupees = paise / 100;
  if (compact) return inrCompact.format(rupees);
  return Number.isInteger(rupees) ? inr.format(rupees).replace(/\.00$/, '') : inr.format(rupees);
}

const RUPEES_RE = /^\d+(\.\d{1,2})?$/;

/** '1,234.5' → 123450. Returns null for invalid input. */
export function rupeesToPaise(input) {
  const s = String(input ?? '').replace(/,/g, '').trim();
  if (!RUPEES_RE.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}

export const paiseToRupeesInput = (paise) => (paise == null ? '' : (paise / 100).toFixed(paise % 100 ? 2 : 0));

export const bpsToPercent = (bps) => (bps == null ? '' : bps / 100);
export const percentToBps = (pct) => Math.round(Number(pct) * 100);
export const formatPercent = (v, digits = 0) => (v == null ? '–' : `${(v * 100).toFixed(digits)}%`);
