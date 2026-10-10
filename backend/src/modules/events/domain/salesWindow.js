export function deriveSalesStatus(event, isMemberWithEarlyAccess, now, pricingPolicy) {
  try {
    return pricingPolicy.salesWindow(event, isMemberWithEarlyAccess, now);
  } catch (err) {
    if (err.code === 'SOLD_OUT') return 'SOLD_OUT';
    if (err.code === 'REGISTRATION_CLOSED') return 'CLOSED';
    return 'NOT_OPEN';
  }
}
