// Integer-only helpers for percentages and ratios (no floating point, ADR-008 spirit).

/** round(a / b) half-up for a >= 0, b > 0, using integers only. */
export function divRoundHalfUp(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b <= 0) {
    throw new RangeError('divRoundHalfUp expects integers a >= 0, b > 0');
  }
  const big = (2n * BigInt(a) + BigInt(b)) / (2n * BigInt(b));
  return Number(big);
}

export const clamp = (min, max, value) => (value < min ? min : value > max ? max : value);
