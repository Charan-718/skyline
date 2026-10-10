import { escapeHtml, formatIsoDate, renderEmailDocument } from './emailLayout.js';

function whenPhrase(p) {
  if (p.daysLeft === undefined) return `on ${formatIsoDate(p.expiresOn)}`;
  const n = p.daysLeft;
  return `in ${n} day${n === 1 ? '' : 's'} (${formatIsoDate(p.expiresOn)})`;
}

export function htmlRenewalReminder7d(p) {
  const when = whenPhrase(p);
  if (p.autopayEnabled) {
    return renderEmailDocument({
      preheader: `AutoPay will renew your ${p.clubName} membership ${when}`,
      eyebrow: p.clubName,
      title: 'Your membership renews automatically',
      meta: [
        { label: 'Plan', value: p.planName },
        { label: 'Valid until', value: formatIsoDate(p.expiresOn) },
      ],
      paragraphs: [
        `Your <strong>${escapeHtml(p.clubName)}</strong> membership (${escapeHtml(p.planName)}) ends ${escapeHtml(when)}.`,
        `<strong>AutoPay is on.</strong> We will charge your saved method and extend your membership on ${escapeHtml(formatIsoDate(p.expiresOn))}. No action is required.`,
        `Prefer not to renew? Turn off AutoPay before that date from your membership page.`,
      ],
      cta: { label: 'Manage membership', href: p.renewUrl },
      footerNote: `${p.clubName} · Campus Flow membership notifications`,
    });
  }
  return renderEmailDocument({
    preheader: `Renew your ${p.clubName} membership ${when}`,
    eyebrow: p.clubName,
    title: 'Membership expiring soon',
    meta: [
      { label: 'Plan', value: p.planName },
      { label: 'Expires', value: formatIsoDate(p.expiresOn) },
    ],
    paragraphs: [
      `Your <strong>${escapeHtml(p.clubName)}</strong> membership (${escapeHtml(p.planName)}) expires ${escapeHtml(when)}.`,
      `Renew now to keep event discounts, merch pricing, and member-only registrations.`,
    ],
    cta: { label: 'Renew membership', href: p.renewUrl },
    footerNote: `${p.clubName} · Campus Flow membership notifications`,
  });
}

export function htmlAnnouncement(p) {
  return renderEmailDocument({
    preheader: p.title,
    eyebrow: p.clubName,
    title: p.title,
    paragraphs: [escapeHtml(p.body).replace(/\n/g, '<br />')],
    cta: p.link ? { label: 'View details', href: p.link } : undefined,
    footerNote: `${p.clubName} announcement · Campus Flow`,
  });
}

export function htmlAutopayResult(p) {
  const ok = p.outcome === 'SUCCEEDED';
  return renderEmailDocument({
    preheader: `AutoPay ${p.outcome.toLowerCase()} — ${p.clubName}`,
    eyebrow: p.clubName,
    title: ok ? 'Membership renewed' : 'AutoPay needs your attention',
    paragraphs: [
      `AutoPay result: <strong>${escapeHtml(p.outcome)}</strong>.` +
        (p.expiresOn ? ` Membership valid until ${escapeHtml(formatIsoDate(p.expiresOn))}.` : '') +
        (p.reason ? ` ${escapeHtml(p.reason)}` : ''),
      ...(ok ? [] : ['Please renew manually if your membership is about to lapse.']),
    ],
    cta: ok ? undefined : { label: 'Renew manually', href: p.renewUrl },
    footerNote: `${p.clubName} · Campus Flow`,
  });
}

export function htmlBookingConfirmed(p) {
  return renderEmailDocument({
    preheader: `Ticket confirmed — ${p.eventTitle}`,
    eyebrow: 'Event ticket',
    title: 'You\'re booked in',
    meta: [
      { label: 'Event', value: p.eventTitle },
      { label: 'When', value: p.startsAt },
      { label: 'Venue', value: p.venue },
      { label: 'Ticket', value: p.ticketCode },
    ],
    paragraphs: ['Show your ticket QR at the venue.'],
    cta: { label: 'View ticket', href: p.ticketUrl },
    footerNote: 'Campus Flow events',
  });
}

export function htmlLowStockAlert(p) {
  return renderEmailDocument({
    preheader: `Low stock — ${p.productName}`,
    eyebrow: 'Inventory alert',
    title: 'Stock running low',
    meta: [
      { label: 'Product', value: p.productName },
      { label: 'Size', value: p.sizeLabel },
      { label: 'Available', value: String(p.available) },
      { label: 'Threshold', value: String(p.threshold) },
    ],
    paragraphs: ['Restock or adjust thresholds before the next merch drop sells out.'],
    cta: { label: 'Open inventory', href: p.inventoryUrl },
    footerNote: 'Campus Flow merchandise',
  });
}
