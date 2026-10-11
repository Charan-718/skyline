import { labelOf } from './fields.js';
import { formatLocal } from './time.js';
import { formatRupees } from '../assistant/eventFacts.js';

// Edit mode: a readable before -> after list and the warnings a club head should see before applying.

const SCHEDULE = ['startsAt', 'endsAt', 'venue'];
const PRICES = ['memberPricePaise', 'nonMemberPricePaise', 'earlyBirdMemberPricePaise', 'earlyBirdNonMemberPricePaise'];

export function formatValue(apiField, value, timeZone) {
  if (/At$/.test(apiField)) return value ? formatLocal(value, timeZone) : 'Not set';
  if (apiField === 'nonMemberPricePaise' && value == null) return 'Members only';
  if (/PricePaise$/.test(apiField)) return value == null ? 'Not set' : formatRupees(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null || value === '') return 'Not set';
  const text = String(value);
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export function describeChanges(before, after, keys, timeZone) {
  return keys.map((k) => ({ field: k, label: labelOf(k), before: formatValue(k, before[k], timeZone), after: formatValue(k, after[k], timeZone) }));
}

export function changeWarnings({ event, after, changed, nonMemberBookings = 0 }) {
  const warnings = [];
  const held = Number(event.seatsReserved ?? 0);
  if (held > 0 && changed.some((k) => SCHEDULE.includes(k))) {
    warnings.push(`${held} ${held === 1 ? 'person already has' : 'people already have'} a ticket or a held seat. They are not notified automatically — consider posting an announcement.`);
  }
  if (held > 0 && changed.some((k) => PRICES.includes(k))) warnings.push('Existing tickets keep the price they were bought at; new prices apply to new bookings only.');
  if (nonMemberBookings > 0 && changed.includes('nonMemberPricePaise') && after.nonMemberPricePaise === null) {
    warnings.push(`${nonMemberBookings} non-member ${nonMemberBookings === 1 ? 'booking stays' : 'bookings stay'} valid even though the event becomes members only.`);
  }
  return warnings;
}
