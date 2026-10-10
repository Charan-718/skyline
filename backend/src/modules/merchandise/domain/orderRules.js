// Order rules (LLD §2.8, §4.7, §5.9). Pure.

export const MAX_LINES = 10;
export const PRICE_RULES = Object.freeze(['LIST', 'MEMBER_DISCOUNT', 'OFFER', 'OFFER_PLUS_MEMBER']);

/** "variantId:qty,variantId:qty" -> [{ variantId, quantity }] or null when malformed. */
export function parseItemsParam(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const items = [];
  for (const part of value.split(',')) {
    const m = /^([0-9a-f-]{36}):(\d{1,2})$/i.exec(part.trim());
    if (!m) return null;
    items.push({ variantId: m[1].toLowerCase(), quantity: Number(m[2]) });
  }
  return items;
}

/** Line count (TOO_MANY_ITEMS) and distinct variants; quantities 1–10 are checked by the schema. */
export function lineProblems(items) {
  if (items.length > MAX_LINES) return { code: 'TOO_MANY_ITEMS', details: { maxLines: MAX_LINES, lines: items.length } };
  const ids = items.map((i) => i.variantId);
  if (new Set(ids).size !== ids.length) {
    return { code: 'VALIDATION_FAILED', details: { fields: [{ path: 'items', message: 'each size may appear only once' }] } };
  }
  return null;
}

/** Guards against an inconsistent unit quote from PricingPolicy (Group 1). */
export function assertUnitQuote(q) {
  const ints = [q.listPricePaise, q.discountPaise, q.finalPricePaise].every(Number.isSafeInteger);
  if (!ints || q.finalPricePaise !== q.listPricePaise - q.discountPaise || q.finalPricePaise < 0 || q.discountPaise < 0 || !PRICE_RULES.includes(q.priceRule)) {
    throw new Error(`PricingPolicy returned an inconsistent quote: ${JSON.stringify(q)}`);
  }
  return q;
}

/** Lines [{ variantId, productId, quantity, unit }] -> totals (integer paise). */
export function totals(lines) {
  const out = lines.map((l) => ({
    variantId: l.variantId,
    productId: l.productId,
    quantity: l.quantity,
    unitListPricePaise: l.unit.listPricePaise,
    unitDiscountPaise: l.unit.discountPaise,
    unitFinalPricePaise: l.unit.finalPricePaise,
    lineTotalPaise: l.unit.finalPricePaise * l.quantity,
    priceRule: l.unit.priceRule,
  }));
  const subtotalPaise = out.reduce((s, l) => s + l.unitListPricePaise * l.quantity, 0);
  const discountPaise = out.reduce((s, l) => s + l.unitDiscountPaise * l.quantity, 0);
  return { lines: out, subtotalPaise, discountPaise, totalPaise: subtotalPaise - discountPaise };
}

/** Pickup is possible only for CONFIRMED orders (LLD §4.7). */
export function pickupProblem(order) {
  if (order.status === 'CONFIRMED') return null;
  if (order.status === 'PICKED_UP') return 'ALREADY_PICKED_UP';
  return 'ORDER_NOT_READY';
}
