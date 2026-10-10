/** Half-up discount from basis points (0–10000). */
export function applyBps(amountPaise, bps) {
  if (bps <= 0) return 0;
  return Math.floor((amountPaise * bps + 5000) / 10000);
}

export function sumPaise(values) {
  return values.reduce((a, b) => a + b, 0);
}
