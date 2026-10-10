// TODO(group1): interface stub. Group 1 (T-22/T-23) replaces this file with the clubs module.
// Signature agreed in GROUP_2_SCOPE_MAP §4.1 / OQ-05; confirm or rename at CP-1.

/**
 * hasClubRole(userId, clubId, roles[]) -> boolean
 * True when the user holds an active (not revoked) assignment of any of `roles` in the club.
 * Used by shared/middleware/authorize.js.
 */
export async function hasClubRole(_userId, _clubId, _roles) {
  throw new Error('TODO(group1): clubs.hasClubRole is not implemented yet');
}

/**
 * TODO(group1): interface stub (OQ-06). listRoleHolders(clubId, role, { trx }?) -> [{ userId }]
 * Active holders of `role` in the club, e.g. club heads for the low-stock email. Called inside
 * order/payment transactions, so it must use `trx` when given (OQ-59).
 */
export async function listRoleHolders(_clubId, _role, _options) {
  throw new Error('TODO(group1): clubs.listRoleHolders is not implemented yet');
}
