import { HOW_TO_BOOK, canBook, isPast } from './eventFacts.js';

// Suggested prompts. Each is answered straight from the event facts: instant, always correct, and it
// never spends Gemini quota. Which suggestions are offered, their wording and their answers all follow
// the event's phase (upcoming, open, closed, happening now, over, cancelled).

export const INTENTS = Object.freeze(['WHEN_WHERE', 'ABOUT', 'PRICES', 'EARLY_BIRD', 'SEATS', 'HOW_TO_BOOK', 'MEMBER_DISCOUNT', 'CANCELLED', 'CONTACT']);

function label(intent, f) {
  const past = isPast(f);
  switch (intent) {
    case 'WHEN_WHERE':
      return f.phase === 'HAPPENING_NOW' ? 'Where is it happening?' : past ? 'When and where was it?' : 'When and where is it?';
    case 'ABOUT':
      return past ? 'What was this event about?' : 'What is this event about?';
    case 'PRICES':
      return 'How much is a ticket?';
    case 'EARLY_BIRD':
      return 'Is early bird still available?';
    case 'SEATS':
      return 'How many seats are left?';
    case 'HOW_TO_BOOK':
      return f.phase === 'REGISTRATION_NOT_OPEN' ? 'When can I register?' : 'How do I book a ticket?';
    case 'MEMBER_DISCOUNT':
      return 'Do members get a discount?';
    case 'CANCELLED':
      return 'Why was this event cancelled?';
    case 'CONTACT':
      return 'Who do I contact about this event?';
    default:
      return intent;
  }
}

export function suggestionsFor(f) {
  let intents;
  switch (f.phase) {
    case 'CANCELLED':
      intents = ['CANCELLED', 'WHEN_WHERE', 'CONTACT'];
      break;
    case 'ENDED':
      intents = ['WHEN_WHERE', 'ABOUT', 'CONTACT'];
      break;
    case 'HAPPENING_NOW':
      intents = ['WHEN_WHERE', 'ABOUT', 'CONTACT'];
      break;
    case 'REGISTRATION_CLOSED':
    case 'SOLD_OUT':
      intents = ['WHEN_WHERE', 'SEATS', 'ABOUT', 'CONTACT'];
      break;
    case 'REGISTRATION_NOT_OPEN':
      intents = ['WHEN_WHERE', 'HOW_TO_BOOK', 'PRICES', 'EARLY_BIRD', 'MEMBER_DISCOUNT', 'ABOUT', 'CONTACT'];
      break;
    default:
      intents = ['WHEN_WHERE', 'PRICES', 'EARLY_BIRD', 'SEATS', 'HOW_TO_BOOK', 'MEMBER_DISCOUNT', 'ABOUT', 'CONTACT'];
  }
  return intents
    .filter((i) => {
      if (i === 'EARLY_BIRD') return f.hasEarlyBird;
      if (i === 'MEMBER_DISCOUNT') return f.memberDiscountEligible && f.membershipPlans.length > 0;
      if (i === 'CONTACT') return Boolean(f.club.contactEmail);
      if (i === 'ABOUT') return Boolean(f.description);
      return true;
    })
    .map((intent) => ({ intent, label: label(intent, f) }));
}

export const labelFor = (intent, f) => label(intent, f);

function whenWhere(f) {
  switch (f.phase) {
    case 'ENDED':
      return `${f.title} took place at ${f.venue} on ${f.startsAt}, ending ${f.endsAt}. It is over now.`;
    case 'CANCELLED':
      return `${f.title} was planned at ${f.venue} on ${f.startsAt}, but it was cancelled and will not take place.`;
    case 'HAPPENING_NOW':
      return `${f.title} is happening right now at ${f.venue}. It ends at ${f.endsAt} (${f.endsRelative}).`;
    default:
      return `${f.title} is at ${f.venue}, from ${f.startsAt} to ${f.endsAt} (${f.startsRelative}). ${registrationLine(f)}`;
  }
}

function registrationLine(f) {
  switch (f.phase) {
    case 'REGISTRATION_NOT_OPEN':
      return `Registration opens on ${f.registrationOpensAt} (${f.registrationOpensRelative}).`;
    case 'EARLY_ACCESS':
      return `Members with early access can register now; everyone else from ${f.registrationOpensAt}.`;
    case 'REGISTRATION_CLOSED':
      return `Registration closed on ${f.registrationClosesAt}.`;
    case 'SOLD_OUT':
      return 'It is sold out.';
    default:
      return `Registration is open until ${f.registrationClosesAt} (${f.registrationClosesRelative}).`;
  }
}

function prices(f) {
  const past = isPast(f);
  const parts = [`${past ? 'Tickets were' : 'Member price:'} ${past ? `${f.memberPrice} for members` : `${f.memberPrice}.`}`];
  if (past) parts[0] += f.membersOnly ? ' (members only).' : ` and ${f.nonMemberPrice} for non-members.`;
  else parts.push(f.membersOnly ? 'This event is for club members only.' : `Non-member price: ${f.nonMemberPrice}.`);
  if (!past && f.earlyBird?.available) {
    parts.push(`Early-bird prices until ${f.earlyBird.endsAt}: members ${f.earlyBird.memberPrice ?? 'n/a'}${f.membersOnly ? '' : `, non-members ${f.earlyBird.nonMemberPrice ?? 'n/a'}`}.`);
  }
  if (!past && f.memberDiscountEligible && f.membershipPlans.length) parts.push("Members also get their plan's event discount on the member price.");
  if (canBook(f)) parts.push('The booking card shows the exact price for you.');
  else if (!past) parts.push(registrationLine(f));
  else parts.push(f.phase === 'CANCELLED' ? 'The event was cancelled.' : 'The event is over, so tickets are no longer sold.');
  return parts.join(' ');
}

function earlyBird(f) {
  if (!f.hasEarlyBird) return 'This event has no early-bird pricing.';
  if (f.earlyBird.available) {
    const left = f.earlyBird.ticketsLeft != null ? ` ${f.earlyBird.ticketsLeft} early-bird tickets are left.` : '';
    return `Yes, early bird is available until ${f.earlyBird.endsAt}: members ${f.earlyBird.memberPrice ?? 'n/a'}${f.membersOnly ? '' : `, non-members ${f.earlyBird.nonMemberPrice ?? 'n/a'}`}.${left}`;
  }
  if (f.phase === 'REGISTRATION_NOT_OPEN') return `Early-bird prices (members ${f.earlyBird.memberPrice ?? 'n/a'}) apply once registration opens on ${f.registrationOpensAt}, until ${f.earlyBird.endsAt}.`;
  return `Early bird is not available any more (it ran until ${f.earlyBird.endsAt}).`;
}

function seats(f) {
  switch (f.phase) {
    case 'ENDED':
      return `The event is over. ${f.ticketsBooked != null ? `${f.ticketsBooked} of ${f.capacity} seats were booked.` : `It had ${f.capacity} seats.`}`;
    case 'CANCELLED':
      return 'The event was cancelled, so there are no seats to book.';
    case 'HAPPENING_NOW':
      return 'The event is already underway, so booking has closed.';
    case 'SOLD_OUT':
      return `It is sold out: all ${f.capacity} seats are taken.`;
    case 'REGISTRATION_CLOSED':
      return `Registration closed on ${f.registrationClosesAt}, so no more seats can be booked.`;
    case 'REGISTRATION_NOT_OPEN':
      return `All ${f.capacity} seats are still free; registration opens on ${f.registrationOpensAt}.`;
    default:
      return `${f.seatsLeft} of ${f.capacity} seats are left.`;
  }
}

function howToBook(f) {
  if (canBook(f)) return HOW_TO_BOOK;
  if (f.phase === 'REGISTRATION_NOT_OPEN') return `Registration opens on ${f.registrationOpensAt} (${f.registrationOpensRelative}). Then sign in, open this page and use the booking card.`;
  return `Booking is not possible: ${f.phaseText}`;
}

function memberDiscount(f) {
  if (!f.memberDiscountEligible) return 'Membership plan discounts do not apply to this event, but members still pay the member price.';
  const plans = f.membershipPlans.map((p) => `${p.name}: ${p.eventDiscount} off`).join('; ');
  return `Yes. Members pay ${f.memberPrice}${f.membersOnly ? '' : ` instead of ${f.nonMemberPrice}`}, and their plan's event discount comes off that${plans ? ` (${plans})` : ''}.`;
}

export function answerIntent(intent, f) {
  switch (intent) {
    case 'WHEN_WHERE':
      return whenWhere(f);
    case 'ABOUT':
      return f.description ? `${f.description}${f.organizers.length ? ` Organised by ${f.organizers.join(', ')}.` : ''}` : 'The organisers have not added a description.';
    case 'PRICES':
      return prices(f);
    case 'EARLY_BIRD':
      return earlyBird(f);
    case 'SEATS':
      return seats(f);
    case 'HOW_TO_BOOK':
      return howToBook(f);
    case 'MEMBER_DISCOUNT':
      return memberDiscount(f);
    case 'CANCELLED':
      return f.phase === 'CANCELLED' ? `This event was cancelled.${f.cancelReason ? ` Reason given: ${f.cancelReason}` : ''}` : 'This event has not been cancelled.';
    case 'CONTACT':
      return f.club.contactEmail ? `You can contact ${f.club.name} at ${f.club.contactEmail}.` : `${f.club.name} has not listed a contact email.`;
    default:
      throw new TypeError(`unknown intent ${intent}`);
  }
}
