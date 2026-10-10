import { z } from 'zod';

// Notification templates (LLD §2.7; OQ-18). Each template has a payload schema checked at enqueue
// time and a renderer used by the dispatcher and the dev outbox. Payloads never carry QR tokens,
// student identifiers or other secrets — links and display values only.

const url = z.string().min(1).max(500);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TEMPLATE_SCHEMAS = Object.freeze({
  ANNOUNCEMENT: z.object({ clubName: z.string(), title: z.string(), body: z.string(), category: z.string(), link: url.optional() }).strict(),
  RENEWAL_REMINDER_7D: z
    .object({ clubName: z.string(), planName: z.string(), expiresOn: date, renewUrl: url, autopayEnabled: z.boolean(), daysLeft: z.number().int().min(0).optional() })
    .strict(),
  AUTOPAY_RESULT: z
    .object({
      clubName: z.string(),
      outcome: z.enum(['SUCCEEDED', 'FAILED', 'PENDING', 'SKIPPED']),
      expiresOn: date.optional(),
      reason: z.string().optional(),
      renewUrl: url,
    })
    .strict(),
  BOOKING_CONFIRMED: z.object({ eventTitle: z.string(), startsAt: z.string(), venue: z.string(), ticketCode: z.string(), ticketUrl: url }).strict(),
  LOW_STOCK_ALERT: z
    .object({ productName: z.string(), sizeLabel: z.string(), available: z.number().int(), threshold: z.number().int(), inventoryUrl: url })
    .strict(),
});

export const TEMPLATES = Object.freeze(Object.keys(TEMPLATE_SCHEMAS));
export const CHANNELS = Object.freeze(['EMAIL']);

const RENDERERS = {
  ANNOUNCEMENT: (p) => ({ subject: `[${p.clubName}] ${p.title}`, text: `${p.body}${p.link ? `\n\n${p.link}` : ''}` }),
  // Two mails: AutoPay members are told the renewal will happen by itself; everyone else is asked to renew.
  RENEWAL_REMINDER_7D: (p) => {
    const when = p.daysLeft === undefined ? `on ${p.expiresOn}` : `in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} (${p.expiresOn})`;
    if (p.autopayEnabled) {
      return {
        subject: `${p.clubName}: AutoPay will renew your membership ${when}`,
        text:
          `Your ${p.clubName} membership (${p.planName}) ends ${when}.\n` +
          `AutoPay is switched on, so your renewal will be triggered automatically on ${p.expiresOn}. You do not need to do anything.\n` +
          `If you would rather not renew, turn AutoPay off before then: ${p.renewUrl}\n`,
      };
    }
    return {
      subject: `${p.clubName}: your membership expires ${when}`,
      text:
        `Your ${p.clubName} membership (${p.planName}) expires ${when}.\n` +
        `Renew now to keep your member benefits: ${p.renewUrl}\n`,
    };
  },
  AUTOPAY_RESULT: (p) => ({
    subject: `${p.clubName}: AutoPay renewal ${p.outcome.toLowerCase()}`,
    text:
      `AutoPay (simulated) result: ${p.outcome}.` +
      (p.expiresOn ? ` Membership valid until ${p.expiresOn}.` : '') +
      (p.reason ? ` Reason: ${p.reason}.` : '') +
      (p.outcome === 'SUCCEEDED' ? '' : `\nRenew manually: ${p.renewUrl}`),
  }),
  BOOKING_CONFIRMED: (p) => ({
    subject: `Booking confirmed: ${p.eventTitle}`,
    text: `Your ticket ${p.ticketCode} for ${p.eventTitle} (${p.startsAt}, ${p.venue}) is confirmed.\nView it: ${p.ticketUrl}`,
  }),
  LOW_STOCK_ALERT: (p) => ({
    subject: `Low stock: ${p.productName} (${p.sizeLabel})`,
    text: `${p.productName} size ${p.sizeLabel} has ${p.available} available (threshold ${p.threshold}).\nInventory: ${p.inventoryUrl}`,
  }),
};

/** Throws a ZodError-wrapped TypeError when the payload does not match the template. */
export function validatePayload(template, payload) {
  const schema = TEMPLATE_SCHEMAS[template];
  if (!schema) throw new TypeError(`unknown notification template ${template}`);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new TypeError(`invalid ${template} payload: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  return parsed.data;
}

/** { subject, text }. */
export function render(template, payload) {
  return RENDERERS[template](payload);
}
