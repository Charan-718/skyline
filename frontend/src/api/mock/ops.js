// Demo-backend business operations (transaction scripts). Used by both the seed and the
// request handlers so seeded data is produced by the same rules as live actions.
import {
  activeBenefits, addDaysDate, addMonthsDate, code, effectiveStatus, err, nowIso, todayIST, uid,
} from './domain';

const HOLD_MINUTES = 15;

export function audit(db, actorUserId, action, entity, entityId, meta = {}) {
  db.audit.push({ id: uid('aud'), actorUserId, action, entity, entityId, meta, at: nowIso() });
}

export function enqueue(db, { userId, channel = 'EMAIL', template, payload, dedupeKey, announcementId }) {
  if (dedupeKey && db.deliveries.some((d) => d.dedupeKey === dedupeKey)) return;
  const user = db.users.find((u) => u.id === userId);
  const hasContact = channel === 'EMAIL' ? !!user?.email : !!user?.phoneE164;
  db.deliveries.push({
    id: uid('dlv'),
    userId,
    channel,
    template,
    payload,
    announcementId,
    dedupeKey: dedupeKey || uid('dk'),
    status: hasContact ? 'SENT' : 'SKIPPED',
    provider: hasContact ? 'dev' : null,
    lastError: hasContact ? null : 'NO_CONTACT',
    attempts: hasContact ? 1 : 0,
    createdAt: nowIso(),
  });
}

export function postLedger(db, row) {
  if (db.ledger.some((l) => l.sourceType === row.sourceType && l.sourceId === row.sourceId)) return null;
  const entry = { id: uid('txn'), status: 'POSTED', currency: 'INR', occurredAt: nowIso(), ...row };
  db.ledger.push(entry);
  return entry;
}

export function createPayment(db, { userId, clubId, purpose, amountPaise, method = 'SIMULATED', at, ...target }) {
  const p = {
    id: uid('pay'),
    userId,
    clubId,
    purpose,
    amountPaise,
    method,
    isSimulated: true,
    reference: `SIM-${code(12)}`,
    status: 'INITIATED',
    createdAt: at || nowIso(),
    settledAt: null,
    membershipTermId: null,
    bookingId: null,
    orderId: null,
    ...target,
  };
  db.payments.push(p);
  return p;
}

/* ───────── Memberships ───────── */
function nextMemberNumber(db, club) {
  club.nextMemberSeq = (club.nextMemberSeq || 1) + 1;
  return `${club.memberPrefix}-${String(club.nextMemberSeq - 1).padStart(6, '0')}`;
}

export function startMembershipTerm(db, { userId, club, plan, kind, source = 'MANUAL', at }) {
  let m = db.memberships.find((x) => x.userId === userId && x.clubId === club.id);
  if (kind === 'JOIN') {
    const current = m ? effectiveStatus(m) : null;
    if (current === 'ACTIVE') throw err(409, 'ALREADY_MEMBER', 'You are already a member of this club.');
    if (current === 'PENDING_PAYMENT') throw err(409, 'PAYMENT_ALREADY_PENDING', 'A payment for this membership is already pending.');
    if (current === 'EXPIRED') throw err(409, 'CONFLICT_STATE', 'Your membership has expired. Renew it from My memberships.', { currentStatus: 'EXPIRED' });
    if (!m) {
      m = { id: uid('mem'), userId, clubId: club.id, status: 'PENDING_PAYMENT', memberNumber: null, currentPlanId: null, startedOn: null, expiresOn: null, qrToken: code(22), autopayEnabled: false, autopayPlanId: null, autopayAmountPaise: null, createdAt: at || nowIso() };
      db.memberships.push(m);
    } else {
      m.status = 'PENDING_PAYMENT';
    }
  }
  if (db.terms.some((t) => t.membershipId === m.id && t.status === 'PENDING_PAYMENT')) {
    throw err(409, 'PAYMENT_ALREADY_PENDING', 'A payment for this membership is already pending.');
  }
  const term = {
    id: uid('term'), membershipId: m.id, kind, source, planId: plan.id, planName: plan.name, feePaise: plan.feePaise,
    durationMonths: plan.durationMonths, eventDiscountBps: plan.eventDiscountBps, merchDiscountBps: plan.merchDiscountBps,
    earlyBirdAccess: plan.earlyBirdAccess, benefitsText: plan.benefitsText, status: 'PENDING_PAYMENT', startsOn: null, endsOn: null, paidAt: null, createdAt: at || nowIso(),
  };
  db.terms.push(term);
  let payment = null;
  if (plan.feePaise === 0) {
    activateTerm(db, term, at);
  } else {
    payment = createPayment(db, { userId, clubId: club.id, purpose: kind === 'JOIN' ? 'MEMBERSHIP_JOIN' : 'MEMBERSHIP_RENEWAL', amountPaise: plan.feePaise, membershipTermId: term.id, method: source === 'AUTOPAY' ? 'SIMULATED_AUTOPAY' : 'SIMULATED', at });
  }
  return { membership: m, term, payment };
}

function activateTerm(db, term, at) {
  const m = db.memberships.find((x) => x.id === term.membershipId);
  const club = db.clubs.find((c) => c.id === m.clubId);
  const today = todayIST(at ? new Date(at) : new Date());
  const isActive = m.status === 'ACTIVE' && m.expiresOn && m.expiresOn >= today;
  term.startsOn = isActive ? addDaysDate(m.expiresOn, 1) : today;
  term.endsOn = addDaysDate(addMonthsDate(term.startsOn, term.durationMonths), -1);
  term.status = 'PAID';
  term.paidAt = at || nowIso();
  m.status = 'ACTIVE';
  m.expiresOn = term.endsOn;
  m.currentPlanId = term.planId;
  if (!m.startedOn) m.startedOn = term.startsOn;
  if (!m.memberNumber) m.memberNumber = nextMemberNumber(db, club);
}

/* ───────── Events ───────── */
export function bookEvent(db, { userId, event, quote, at }) {
  if (db.bookings.some((b) => b.eventId === event.id && b.userId === userId && ['PENDING_PAYMENT', 'CONFIRMED'].includes(b.status))) {
    throw err(409, 'ALREADY_BOOKED', 'You already have a ticket or pending booking for this event.');
  }
  if (event.seatsReserved >= event.capacity) throw err(409, 'SOLD_OUT', 'This event is sold out.');
  event.seatsReserved += 1;
  if (quote.usesEarlyBird) event.earlyBirdReserved += 1;
  const created = at || nowIso();
  const booking = {
    id: uid('bkg'), eventId: event.id, clubId: event.clubId, userId, status: 'PENDING_PAYMENT', buyerType: quote.buyerType,
    priceTier: quote.priceTier, listPricePaise: quote.listPricePaise, discountPaise: quote.discountPaise, finalPricePaise: quote.finalPricePaise,
    pricingMode: 'BEST_OF', usesEarlyBird: !!quote.usesEarlyBird, membershipTermId: quote.membershipTermId || null,
    holdExpiresAt: new Date(new Date(created).getTime() + HOLD_MINUTES * 60000).toISOString(), createdAt: created,
  };
  db.bookings.push(booking);
  let payment = null;
  let ticket = null;
  if (quote.finalPricePaise === 0) {
    booking.status = 'CONFIRMED';
    ticket = issueTicket(db, booking, at);
  } else {
    payment = createPayment(db, { userId, clubId: event.clubId, purpose: 'EVENT_TICKET', amountPaise: quote.finalPricePaise, bookingId: booking.id, at });
  }
  return { booking, payment, ticket };
}

export function issueTicket(db, booking, at) {
  const t = { id: uid('tkt'), bookingId: booking.id, eventId: booking.eventId, clubId: booking.clubId, userId: booking.userId, ticketCode: code(10), qrToken: code(22), status: 'VALID', usedAt: null, usedBy: null, createdAt: at || nowIso() };
  db.tickets.push(t);
  return t;
}

/* ───────── Merchandise ───────── */
export function evaluateLowStock(db, variant) {
  const available = variant.stockOnHand - variant.stockReserved;
  const open = db.alerts.find((a) => a.variantId === variant.id && a.status === 'OPEN');
  if (available <= variant.lowStockThreshold && !open) {
    const alert = { id: uid('lsa'), variantId: variant.id, productId: variant.productId, clubId: variant.clubId, status: 'OPEN', availableAtAlert: available, threshold: variant.lowStockThreshold, createdAt: nowIso(), resolvedAt: null };
    db.alerts.push(alert);
    db.roles.filter((r) => r.clubId === variant.clubId && r.role === 'CLUB_HEAD' && !r.revokedAt).forEach((r) => {
      enqueue(db, { userId: r.userId, template: 'LOW_STOCK_ALERT', payload: { variantId: variant.id }, dedupeKey: `low-stock:${alert.id}:${r.userId}` });
    });
  } else if (available > variant.lowStockThreshold && open) {
    open.status = 'RESOLVED';
    open.resolvedAt = nowIso();
  }
}

export function moveStock(db, variant, type, quantity, { reason, orderId, actorUserId } = {}) {
  db.movements.push({ id: uid('mov'), variantId: variant.id, clubId: variant.clubId, type, quantity, reason: reason || null, orderId: orderId || null, actorUserId: actorUserId || null, createdAt: nowIso() });
}

export function placeOrder(db, { userId, clubId, lines, at }) {
  lines.forEach(({ variant, quantity }) => {
    if (variant.stockOnHand - variant.stockReserved < quantity) {
      throw err(409, 'OUT_OF_STOCK', 'Not enough stock for one of the sizes in your cart.', { variantId: variant.id, available: variant.stockOnHand - variant.stockReserved });
    }
  });
  const order = { id: uid('ord'), userId, clubId, status: 'PENDING_PAYMENT', pickupCode: null, totalPaise: 0, holdExpiresAt: new Date(new Date(at || nowIso()).getTime() + HOLD_MINUTES * 60000).toISOString(), createdAt: at || nowIso(), pickedUpAt: null, pickedUpBy: null };
  db.orders.push(order);
  lines.forEach(({ variant, product, quantity, quote }) => {
    variant.stockReserved += quantity;
    moveStock(db, variant, 'RESERVE', quantity, { orderId: order.id });
    db.orderItems.push({ id: uid('oit'), orderId: order.id, productId: product.id, variantId: variant.id, productName: product.name, sizeLabel: variant.sizeLabel, quantity, unitListPricePaise: quote.listPricePaise, unitDiscountPaise: quote.discountPaise, unitFinalPricePaise: quote.finalPricePaise, lineTotalPaise: quote.finalPricePaise * quantity, priceRule: quote.priceRule });
    order.totalPaise += quote.finalPricePaise * quantity;
  });
  const payment = createPayment(db, { userId, clubId, purpose: 'MERCH_ORDER', amountPaise: order.totalPaise, orderId: order.id, at });
  return { order, payment };
}

/* ───────── Settlement (payments.settle + purpose handlers) ───────── */
export function settlePayment(db, payment, outcome, { at, reason } = {}) {
  if (!['INITIATED', 'PENDING'].includes(payment.status)) return payment; // terminal: idempotent
  if (outcome === 'PENDING') {
    payment.status = 'PENDING';
    return payment;
  }
  payment.status = outcome;
  payment.settledAt = at || nowIso();
  payment.failureReason = outcome === 'SUCCEEDED' ? null : reason || 'SIMULATED_FAILURE';
  const ok = outcome === 'SUCCEEDED';

  if (payment.purpose === 'MEMBERSHIP_JOIN' || payment.purpose === 'MEMBERSHIP_RENEWAL') {
    const term = db.terms.find((t) => t.id === payment.membershipTermId);
    const m = db.memberships.find((x) => x.id === term.membershipId);
    if (ok) {
      activateTerm(db, term, at);
      postLedger(db, { clubId: payment.clubId, direction: 'IN', category: payment.purpose === 'MEMBERSHIP_JOIN' ? 'MEMBERSHIP_DUES' : 'MEMBERSHIP_RENEWAL', amountPaise: payment.amountPaise, sourceType: 'PAYMENT', sourceId: payment.id, payerUserId: payment.userId, reference: payment.reference, description: `${term.planName} membership ${term.kind === 'JOIN' ? 'dues' : 'renewal'}`, occurredAt: payment.settledAt });
      payment.result = { membershipStatus: 'ACTIVE', expiresOn: m.expiresOn, memberNumber: m.memberNumber };
    } else {
      term.status = 'FAILED';
      if (term.kind === 'JOIN' && m.status === 'PENDING_PAYMENT') m.status = 'CANCELLED';
      payment.result = { membershipStatus: effectiveStatus(m) };
    }
  } else if (payment.purpose === 'EVENT_TICKET') {
    const booking = db.bookings.find((b) => b.id === payment.bookingId);
    const event = db.events.find((e) => e.id === booking.eventId);
    if (ok) {
      booking.status = 'CONFIRMED';
      const ticket = issueTicket(db, booking, at);
      postLedger(db, { clubId: payment.clubId, direction: 'IN', category: 'TICKET_SALE', amountPaise: payment.amountPaise, sourceType: 'PAYMENT', sourceId: payment.id, eventId: event.id, payerUserId: payment.userId, reference: payment.reference, description: `Ticket: ${event.title}`, occurredAt: payment.settledAt });
      enqueue(db, { userId: booking.userId, template: 'BOOKING_CONFIRMED', payload: { eventTitle: event.title }, dedupeKey: `booking:${booking.id}` });
      payment.result = { bookingStatus: 'CONFIRMED', ticketId: ticket.id };
    } else {
      booking.status = outcome === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
      event.seatsReserved -= 1;
      if (booking.usesEarlyBird) event.earlyBirdReserved -= 1;
      payment.result = { bookingStatus: booking.status };
    }
  } else if (payment.purpose === 'MERCH_ORDER') {
    const order = db.orders.find((o) => o.id === payment.orderId);
    const items = db.orderItems.filter((i) => i.orderId === order.id);
    items.forEach((it) => {
      const v = db.variants.find((x) => x.id === it.variantId);
      v.stockReserved -= it.quantity;
      if (ok) {
        v.stockOnHand -= it.quantity;
        moveStock(db, v, 'SALE', -it.quantity, { orderId: order.id });
      } else {
        moveStock(db, v, 'RELEASE', -it.quantity, { orderId: order.id });
      }
      evaluateLowStock(db, v);
    });
    if (ok) {
      order.status = 'CONFIRMED';
      order.pickupCode = code(8);
      postLedger(db, { clubId: payment.clubId, direction: 'IN', category: 'MERCH_SALE', amountPaise: payment.amountPaise, sourceType: 'PAYMENT', sourceId: payment.id, payerUserId: payment.userId, reference: payment.reference, description: `Merchandise order ${order.id.slice(-6).toUpperCase()}`, occurredAt: payment.settledAt });
      payment.result = { orderStatus: 'CONFIRMED', pickupCode: order.pickupCode };
    } else {
      order.status = outcome === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
      payment.result = { orderStatus: order.status };
    }
  }
  return payment;
}

export { activeBenefits };
