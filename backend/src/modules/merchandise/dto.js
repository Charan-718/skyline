// JSON shapes for merchandise (camelCase, integer paise, ISO instants).
const iso = (v) => (v ? new Date(v).toISOString() : null);

export const toCategoryDto = (c) => ({ id: c.id, clubId: c.club_id, name: c.name });

export function toProductDto({ product: p, variants, includeStock, displayPrice }) {
  return {
    id: p.id,
    clubId: p.club_id,
    categoryId: p.category_id,
    name: p.name,
    description: p.description,
    pricePaise: p.price_paise,
    memberDiscountEligible: p.member_discount_eligible,
    availableToNonMembers: p.available_to_non_members,
    membersOnly: !p.available_to_non_members,
    offerPricePaise: p.offer_price_paise,
    offerStartsAt: iso(p.offer_starts_at),
    offerEndsAt: iso(p.offer_ends_at),
    status: p.status,
    variants: variants.map(({ variant: v, available, orderable }) => ({
      id: v.id,
      sizeLabel: v.size_label,
      available,
      orderable,
      ...(includeStock ? { stockOnHand: v.stock_on_hand, stockReserved: v.stock_reserved, lowStockThreshold: v.low_stock_threshold, isActive: v.is_active } : {}),
    })),
    ...(displayPrice === undefined ? {} : { displayPrice }),
  };
}

export const toVariantDto = (v) => ({
  id: v.id,
  productId: v.product_id,
  clubId: v.club_id,
  sizeLabel: v.size_label,
  stockOnHand: v.stock_on_hand,
  stockReserved: v.stock_reserved,
  available: v.stock_on_hand - v.stock_reserved,
  lowStockThreshold: v.low_stock_threshold,
  isActive: v.is_active,
});

export const toAlertDto = (a) => ({
  id: a.id,
  variantId: a.variant_id,
  productId: a.product_id,
  productName: a.product_name,
  sizeLabel: a.size_label,
  status: a.status,
  availableAtTrigger: a.available_at_trigger,
  thresholdAtTrigger: a.threshold_at_trigger,
  triggeredAt: iso(a.triggered_at),
  resolvedAt: iso(a.resolved_at),
});

export const toInventoryDto = (r) => ({
  productId: r.product_id,
  productName: r.product_name,
  productStatus: r.product_status,
  variantId: r.id,
  sizeLabel: r.size_label,
  onHand: r.stock_on_hand,
  reserved: r.stock_reserved,
  available: r.stock_on_hand - r.stock_reserved,
  threshold: r.low_stock_threshold,
  isActive: r.is_active,
  alert: r.alert_id ? { id: r.alert_id, triggeredAt: iso(r.alert_triggered_at) } : null,
});

export const toItemDto = (i) => ({
  variantId: i.variant_id,
  productId: i.product_id,
  productName: i.product_name ?? null,
  sizeLabel: i.size_label ?? null,
  quantity: i.quantity,
  unitListPricePaise: i.unit_list_price_paise,
  unitDiscountPaise: i.unit_discount_paise,
  unitFinalPricePaise: i.unit_final_price_paise,
  lineTotalPaise: i.line_total_paise,
  priceRule: i.price_rule,
});

const paymentSummary = (p) => (p ? { id: p.id, status: p.status, amountPaise: p.amount_paise, reference: p.reference, isSimulated: p.is_simulated } : null);

/** `showPickupCode`: owners only — the club desk verifies codes, it is not shown them (OQ-58). */
export function toOrderDto(o, { items = [], payment = null, buyer, showPickupCode = false, history } = {}) {
  return {
    id: o.id,
    clubId: o.club_id,
    ...(buyer !== undefined ? { buyer: buyer ? { id: buyer.id, fullName: buyer.fullName } : { id: o.user_id, fullName: null } } : {}),
    status: o.status,
    buyerType: o.buyer_type,
    subtotalPaise: o.subtotal_paise,
    discountPaise: o.discount_paise,
    totalPaise: o.total_paise,
    pricingMode: o.pricing_mode,
    ...(showPickupCode ? { pickupCode: ['CONFIRMED', 'PICKED_UP'].includes(o.status) ? o.pickup_code : null } : {}),
    holdExpiresAt: iso(o.hold_expires_at),
    confirmedAt: iso(o.confirmed_at),
    pickedUpAt: iso(o.picked_up_at),
    cancelledAt: iso(o.cancelled_at),
    cancelReason: o.cancel_reason,
    createdAt: iso(o.created_at),
    items: items.map(toItemDto),
    payment: paymentSummary(payment),
    ...(history ? { payments: history.map(paymentSummary) } : {}),
  };
}
