import nodemailer from 'nodemailer';
import { NotificationError } from './NotificationError.js';

// Email over plain SMTP (nodemailer). Works with any mailbox that offers SMTP and needs no domain,
// e.g. Gmail with an App Password (smtp.gmail.com:465). Returns { provider, providerMessageId } or
// throws NotificationError { code, retryable }. Retryable: connection/timeout problems and 4xx
// replies. Permanent: bad credentials, 5xx replies (rejected address, blocked sender).
// Addresses and message bodies are never logged or put in error text.

const TIMEOUT_MS = 15_000;
const TRANSIENT = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN']);

function toNotificationError(err) {
  if (err?.code === 'EAUTH') return new NotificationError('SMTP_AUTH', { retryable: false });
  if (TRANSIENT.has(err?.code)) return new NotificationError(`SMTP_${err.code}`, { retryable: true });
  const reply = Number(err?.responseCode);
  if (reply >= 400 && reply < 500) return new NotificationError(`SMTP_${reply}`, { retryable: true });
  if (reply >= 500) return new NotificationError(`SMTP_${reply}`, { retryable: false });
  return new NotificationError('SMTP_ERROR', { retryable: false });
}

/** `transport` is injectable for tests; otherwise a pooled SMTP transport is created. */
export function createSmtpEmailAdapter({ host, port, secure, user, pass, fromEmail, fromName, transport }) {
  const mailer =
    transport ??
    nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  const from = { name: fromName, address: fromEmail };
  return Object.freeze({
    channel: 'EMAIL',
    async send({ to, subject, text, html }) {
      try {
        const info = await mailer.sendMail({
          from,
          to,
          subject,
          text,
          ...(html ? { html } : {}),
        });
        return { provider: 'smtp', providerMessageId: info?.messageId ?? null };
      } catch (err) {
        throw toNotificationError(err);
      }
    },
  });
}
