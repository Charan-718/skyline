import { todayIST } from '../../../shared/clock.js';

export function effectiveMembershipStatus(membership) {
  const status = membership.status;
  const expiresOn = membership.expiresOn ?? membership.expires_on;
  if (status === 'ACTIVE' && expiresOn && expiresOn < todayIST()) {
    return 'EXPIRED';
  }
  return status;
}

export function canRegister(membership) {
  if (!membership) return { ok: true };
  const eff = effectiveMembershipStatus(membership);
  if (eff === 'ACTIVE' || eff === 'EXPIRED') {
    return { ok: false, code: 'ALREADY_MEMBER' };
  }
  if (membership.status === 'PENDING_PAYMENT') {
    return { ok: false, code: 'PAYMENT_ALREADY_PENDING' };
  }
  if (membership.status === 'CANCELLED' || !membership) {
    return { ok: true };
  }
  return { ok: true };
}

export function canRenew(membership) {
  const eff = effectiveMembershipStatus(membership);
  if (membership.status === 'PENDING_PAYMENT') {
    return { ok: false, code: 'PAYMENT_ALREADY_PENDING' };
  }
  if (membership.status === 'CANCELLED') {
    return { ok: false, code: 'CONFLICT_STATE' };
  }
  if (eff === 'ACTIVE' || eff === 'EXPIRED') {
    return { ok: true };
  }
  return { ok: false, code: 'CONFLICT_STATE' };
}
