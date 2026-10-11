// Builds the facts the event assistant may use (LLD-style allow-list). Only fields that are already
// public on the event page go in: no user IDs, emails of members, bookings, tickets, QR tokens or
// check-ins. Money and dates are formatted here so the language model never does arithmetic or
// time-zone conversion.

const toNumber = (v) => (v == null ? null : Number(v));

export function formatRupees(paise) {
  const n = toNumber(paise);
  if (n == null) return null;
  if (n === 0) return 'Free';
  const rupees = n / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function formatWhen(value, timeZone) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const text = new Intl.DateTimeFormat('en-IN', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  return `${text} IST`;
}

const pct = (bps) => `${toNumber(bps) / 100}%`;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** "in 3 days", "in 5 hours", "12 days ago" — so the model never has to compare dates itself. */
export function relativeTo(target, now) {
  if (!target) return null;
  const diff = new Date(target).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const unit = abs >= DAY_MS ? ['day', Math.round(abs / DAY_MS)] : abs >= HOUR_MS ? ['hour', Math.round(abs / HOUR_MS)] : ['minute', Math.max(1, Math.round(abs / 60_000))];
  const text = `${unit[1]} ${unit[0]}${unit[1] === 1 ? '' : 's'}`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/**
 * Where the event is in its life, from the status and the current time:
 *   CANCELLED | DRAFT | ENDED | HAPPENING_NOW | SOLD_OUT | REGISTRATION_CLOSED |
 *   REGISTRATION_NOT_OPEN | EARLY_ACCESS | REGISTRATION_OPEN
 */
export function eventPhase(event, now) {
  const t = now.getTime();
  const at = (v) => (v ? new Date(v).getTime() : null);
  if (event.status === 'CANCELLED') return 'CANCELLED';
  if (event.status === 'DRAFT') return 'DRAFT';
  if (event.status === 'COMPLETED' || t > at(event.endsAt)) return 'ENDED';
  if (t >= at(event.startsAt)) return 'HAPPENING_NOW';
  if (t > at(event.registrationClosesAt)) return 'REGISTRATION_CLOSED';
  if ((event.remainingSeats ?? event.capacity - (event.seatsReserved ?? 0)) <= 0) return 'SOLD_OUT';
  const early = at(event.earlyAccessOpensAt);
  if (t < at(event.registrationOpensAt)) return early != null && t >= early ? 'EARLY_ACCESS' : 'REGISTRATION_NOT_OPEN';
  return 'REGISTRATION_OPEN';
}

/** One plain sentence describing the phase, given to the model first and used by the answers. */
export function phaseSentence(f) {
  switch (f.phase) {
    case 'CANCELLED':
      return `This event was cancelled${f.cancelReason ? ` (reason: ${f.cancelReason})` : ''}. It will not take place and cannot be booked.`;
    case 'DRAFT':
      return 'This event is a draft and has not been published yet.';
    case 'ENDED':
      return `This event is over. It took place on ${f.startsAt} and ended ${f.endsRelative}. Booking is no longer possible.`;
    case 'HAPPENING_NOW':
      return `This event is happening right now (started ${f.startsRelative}, ends ${f.endsRelative}, at ${f.endsAt}). Booking has closed.`;
    case 'REGISTRATION_CLOSED':
      return `Registration closed on ${f.registrationClosesAt}. The event itself starts ${f.startsRelative}, on ${f.startsAt}.`;
    case 'SOLD_OUT':
      return `The event is sold out: all ${f.capacity} seats are taken. It starts ${f.startsRelative}, on ${f.startsAt}.`;
    case 'REGISTRATION_NOT_OPEN':
      return `Registration has not opened yet; it opens ${f.registrationOpensRelative}, on ${f.registrationOpensAt}. The event starts ${f.startsRelative}.`;
    case 'EARLY_ACCESS':
      return `Members with early access can register now; registration opens to everyone ${f.registrationOpensRelative}, on ${f.registrationOpensAt}.`;
    default:
      return `Registration is open until ${f.registrationClosesAt} (${f.registrationClosesRelative}). ${f.seatsLeft} of ${f.capacity} seats are left. The event starts ${f.startsRelative}.`;
  }
}

export const isPast = (f) => ['ENDED', 'CANCELLED'].includes(f.phase);
export const canBook = (f) => ['REGISTRATION_OPEN', 'EARLY_ACCESS'].includes(f.phase);

/**
 * @param {object} event  eventService.getEvent() view (camelCase)
 * @param {{ description?: string, contact_email?: string|null }|null} club
 * @param {Array<object>} plans  active membership_plans rows of the club
 */
export function buildEventFacts({ event, club, plans = [], now = new Date(), timeZone = 'Asia/Kolkata' }) {
  const ebEnds = event.earlyBirdEndsAt ? new Date(event.earlyBirdEndsAt) : null;
  const hasEarlyBird = event.earlyBirdMemberPricePaise != null || event.earlyBirdNonMemberPricePaise != null;
  const earlyBirdLeft = event.earlyBirdRemaining == null ? null : Number(event.earlyBirdRemaining);
  const earlyBirdOpen = hasEarlyBird && ebEnds != null && now <= ebEnds && (earlyBirdLeft == null || earlyBirdLeft > 0);
  const facts = {
    eventId: event.id,
    now: formatWhen(now, timeZone),
    phase: eventPhase(event, now),
    startsRelative: relativeTo(event.startsAt, now),
    endsRelative: relativeTo(event.endsAt, now),
    registrationOpensRelative: relativeTo(event.registrationOpensAt, now),
    registrationClosesRelative: relativeTo(event.registrationClosesAt, now),
    ticketsBooked: toNumber(event.ticketsSold ?? null),
    title: event.title,
    description: (event.description ?? '').slice(0, 2000),
    venue: event.venue,
    status: event.status,
    salesStatus: event.salesStatus ?? null,
    cancelReason: event.status === 'CANCELLED' ? event.cancelReason ?? null : null,
    startsAt: formatWhen(event.startsAt, timeZone),
    endsAt: formatWhen(event.endsAt, timeZone),
    registrationOpensAt: formatWhen(event.registrationOpensAt, timeZone),
    registrationClosesAt: formatWhen(event.registrationClosesAt, timeZone),
    earlyAccessOpensAt: formatWhen(event.earlyAccessOpensAt, timeZone),
    capacity: toNumber(event.capacity),
    seatsLeft: toNumber(event.remainingSeats ?? event.capacity - (event.seatsReserved ?? 0)),
    memberPrice: formatRupees(event.memberPricePaise),
    nonMemberPrice: formatRupees(event.nonMemberPricePaise),
    membersOnly: event.nonMemberPricePaise == null,
    memberDiscountEligible: event.memberDiscountEligible !== false,
    hasEarlyBird,
    earlyBird: hasEarlyBird
      ? {
          memberPrice: formatRupees(event.earlyBirdMemberPricePaise),
          nonMemberPrice: formatRupees(event.earlyBirdNonMemberPricePaise),
          endsAt: formatWhen(event.earlyBirdEndsAt, timeZone),
          ticketsLeft: earlyBirdLeft,
          available: earlyBirdOpen,
        }
      : null,
    organizers: (event.organizers ?? []).map((o) => o.fullName).filter(Boolean),
    club: {
      name: event.clubName ?? null,
      description: (club?.description ?? '').slice(0, 1000),
      contactEmail: club?.contact_email ?? null,
    },
    membershipPlans: plans.map((p) => ({
      name: p.name,
      fee: formatRupees(p.fee_paise),
      durationMonths: toNumber(p.duration_months),
      eventDiscount: pct(p.event_discount_bps ?? 0),
      earlyAccessToEvents: Boolean(p.early_bird_access),
    })),
  };
  // Early bird can only be "available" while the event can actually be booked.
  if (facts.earlyBird && !canBook(facts)) facts.earlyBird.available = false;
  facts.phaseText = phaseSentence(facts);
  return facts;
}

const HOW_TO_BOOK =
  'Sign in, open this event page and use the booking card on the right. The price shown is quoted by the server for you ' +
  '(member or non-member). Paid tickets go to a checkout page; free tickets are issued at once. Your ticket and its QR code ' +
  'appear under "My tickets" and are scanned at the entrance.';

/** Plain-text block given to the model between <event_facts> tags. Phase and time come first. */
export function factsToText(f) {
  const past = isPast(f);
  const lines = [
    `Current date and time: ${f.now}`,
    `Event phase: ${f.phase}. ${f.phaseText}`,
    `Title: ${f.title}`,
    `Organising club: ${f.club.name ?? 'unknown'}`,
    f.club.description && `About the club: ${f.club.description}`,
    f.club.contactEmail && `Club contact email: ${f.club.contactEmail}`,
    f.organizers.length && `Organizers: ${f.organizers.join(', ')}`,
    `Venue: ${f.venue}`,
    `Starts: ${f.startsAt} (${f.startsRelative})`,
    `Ends: ${f.endsAt} (${f.endsRelative})`,
    `Registration window: ${f.registrationOpensAt} (${f.registrationOpensRelative}) to ${f.registrationClosesAt} (${f.registrationClosesRelative})`,
    f.earlyAccessOpensAt && `Member early access to registration from: ${f.earlyAccessOpensAt} (members whose plan includes early access)`,
    past
      ? `Capacity was ${f.capacity} seats${f.ticketsBooked != null ? `; ${f.ticketsBooked} tickets were booked` : ''}`
      : `Capacity: ${f.capacity} seats, ${f.seatsLeft} left${f.ticketsBooked != null ? ` (${f.ticketsBooked} tickets booked)` : ''}`,
    `${past ? 'Ticket price was' : 'Ticket price'}: members ${f.memberPrice}; ${f.membersOnly ? 'members only (non-members cannot book)' : `non-members ${f.nonMemberPrice}`}`,
    f.memberDiscountEligible
      ? "Members also get their membership plan's event discount on the member price"
      : 'Membership plan event discounts do not apply to this event',
    f.earlyBird &&
      `Early bird: member ${f.earlyBird.memberPrice ?? 'n/a'}, non-member ${f.earlyBird.nonMemberPrice ?? 'n/a'}, until ${f.earlyBird.endsAt}` +
        `${f.earlyBird.ticketsLeft != null ? `, ${f.earlyBird.ticketsLeft} early-bird tickets left` : ''}; currently ${f.earlyBird.available ? 'available' : 'not available'}`,
    f.membershipPlans.length &&
      `Club membership plans: ${f.membershipPlans
        .map((p) => `${p.name} (${p.fee} for ${p.durationMonths} months, ${p.eventDiscount} off events${p.earlyAccessToEvents ? ', early access to registration' : ''})`)
        .join('; ')}`,
    canBook(f) ? `How to book: ${HOW_TO_BOOK}` : 'Booking: not possible right now (see Event phase).',
  ];
  return lines.filter(Boolean).join('\n');
}

export { HOW_TO_BOOK };
