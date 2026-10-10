import QRCode from 'qrcode';

const TICKET_PREFIX = 'SOMS1:T:';
const MEMBERSHIP_PREFIX = 'SOMS1:M:';

export function buildTicketQrPayload(qrToken) {
  return `${TICKET_PREFIX}${qrToken}`;
}

export function buildMembershipQrPayload(qrToken) {
  return `${MEMBERSHIP_PREFIX}${qrToken}`;
}

export function parseTicketQrPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(TICKET_PREFIX)) {
    return null;
  }
  const token = payload.slice(TICKET_PREFIX.length);
  return token.length > 0 ? token : null;
}

export function parseMembershipQrPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(MEMBERSHIP_PREFIX)) {
    return null;
  }
  const token = payload.slice(MEMBERSHIP_PREFIX.length);
  return token.length > 0 ? token : null;
}

export async function renderQrSvg(payload) {
  return QRCode.toString(payload, { type: 'svg', margin: 1 });
}
