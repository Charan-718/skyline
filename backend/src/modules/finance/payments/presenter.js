import { toCamelCase } from '../../../shared/caseMap.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

/** Rich payment view aligned with frontend mock `paymentTarget`. */
export async function presentPayment(db, payment) {
  const p = payment.id ? payment : toCamelCase(payment);
  const club = await db('clubs').where({ id: p.clubId }).first();

  let target = null;
  if (p.membershipTermId) {
    const term = await db('membership_terms').where({ id: p.membershipTermId }).first();
    target = {
      kind: 'MEMBERSHIP',
      title: term ? `${term.plan_name} membership, ${club?.name ?? ''}`.trim() : club?.name,
      membershipId: term?.membership_id,
      clubName: club?.name ?? null,
    };
  } else if (p.bookingId) {
    const booking = await db('bookings').where({ id: p.bookingId }).first();
    const event = booking ? await db('events').where({ id: booking.event_id }).first() : null;
    const ticket = booking ? await db('tickets').where({ booking_id: booking.id }).first() : null;
    target = {
      kind: 'EVENT_TICKET',
      title: event ? `Ticket: ${event.title}` : 'Event ticket',
      eventId: booking?.event_id,
      bookingId: p.bookingId,
      ticketId: ticket?.id,
      priceTier: booking?.price_tier,
      holdExpiresAt:
        booking?.status === 'PENDING_PAYMENT' ? iso(booking.hold_expires_at) : null,
      clubName: club?.name ?? null,
    };
  } else if (p.orderId) {
    const order = await db('orders').where({ id: p.orderId }).first();
    target = {
      kind: 'MERCH_ORDER',
      title: `Merchandise order, ${club?.name ?? ''}`.trim(),
      orderId: p.orderId,
      holdExpiresAt: order?.status === 'PENDING_PAYMENT' ? iso(order.hold_expires_at) : null,
      clubName: club?.name ?? null,
    };
  }

  return {
    id: p.id,
    clubId: p.clubId,
    userId: p.userId,
    purpose: p.purpose,
    amountPaise: Number(p.amountPaise),
    currency: p.currency ?? 'INR',
    method: p.method,
    isSimulated: p.isSimulated ?? true,
    status: p.status,
    reference: p.reference,
    failureReason: p.failureReason ?? null,
    createdAt: iso(p.createdAt),
    settledAt: iso(p.settledAt),
    target,
  };
}
