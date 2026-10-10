import { deriveSalesStatus } from './domain/salesWindow.js';
import { now } from '../../shared/clock.js';

/**
 * Public event shape aligned with frontend mock `eventView` (LLD §4 / mock handlers).
 */
export function presentEvent(dbRow, ctx = {}) {
  const ev = dbRow;
  const ticketsSold = ctx.ticketsSold ?? 0;
  const organizers = ctx.organizers ?? [];
  return {
    ...ev,
    clubName: ctx.clubName ?? null,
    clubSlug: ctx.clubSlug ?? null,
    salesStatus: deriveSalesStatus(ev, ctx.earlyBirdAccess ?? false, now(), ctx.pricingPolicy),
    remainingSeats: ev.capacity - (ev.seatsReserved ?? 0),
    earlyBirdRemaining:
      ev.earlyBirdQuantity == null ? null : ev.earlyBirdQuantity - (ev.earlyBirdReserved ?? 0),
    ticketsSold,
    organizers,
  };
}
