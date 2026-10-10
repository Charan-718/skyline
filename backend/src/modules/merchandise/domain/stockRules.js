// Stock rules (LLD §2.8, §5.10). Pure.
// Movement quantities are signed against the counter they change (OQ-57):
//   RESTOCK +q (on hand)   ADJUSTMENT ±q (on hand)   RESERVE +q (reserved)
//   RELEASE −q (reserved)  SALE −q (on hand; the reservation is consumed at the same time)

export const available = (v) => v.stock_on_hand - v.stock_reserved;

export function adjustmentProblems({ type, quantity }) {
  if (!Number.isInteger(quantity) || quantity === 0) return [{ path: 'quantity', message: 'quantity must be a non-zero integer' }];
  if (type === 'RESTOCK' && quantity < 0) return [{ path: 'quantity', message: 'RESTOCK quantity must be positive' }];
  return [];
}

/** One alert per crossing: OPEN when available ≤ threshold, RESOLVE when it rises above. */
export const lowStockAction = (v) => (available(v) <= v.low_stock_threshold ? 'OPEN' : 'RESOLVE');
