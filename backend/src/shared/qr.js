import QRCode from 'qrcode';
import { appError } from './errors.js';

// QR payloads are opaque: SOMS1:<kind>:<token>, kind M = membership card, T = ticket (LLD §2.4, §5.8).
const PAYLOAD = /^SOMS1:([MT]):([A-Za-z0-9_-]{16,64})$/;

export const QR_KIND = Object.freeze({ MEMBERSHIP: 'M', TICKET: 'T' });

export function buildPayload(kind, token) {
  if (!Object.values(QR_KIND).includes(kind)) throw new TypeError('unknown QR kind');
  const payload = `SOMS1:${kind}:${token}`;
  if (!PAYLOAD.test(payload)) throw new TypeError('invalid QR token');
  return payload;
}

/** Returns {kind, token}, or null for anything else (callers raise their own INVALID_QR_FORMAT). */
export function parsePayload(payload) {
  const match = typeof payload === 'string' ? PAYLOAD.exec(payload.trim()) : null;
  if (!match) return null;
  return { kind: match[1], token: match[2] };
}

export async function renderSvg(payload) {
  if (!PAYLOAD.test(payload)) throw appError('VALIDATION_FAILED', { fields: [{ path: 'qrPayload', message: 'invalid' }] });
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
}
