// TODO(group1): interface stub. Group 1 (T-20) replaces this file with the auth module.
// Signature agreed in GROUP_2_SCOPE_MAP §4.1 / OQ-05; confirm or rename at CP-1.

/**
 * getUser(userId, { trx }?) -> { id, fullName, email, phoneE164, isActive } | null
 * Used by shared/middleware/requireAuth.js and notifications.enqueue. When called inside a
 * transaction, the caller passes `trx` so no second pool connection is needed (OQ-59).
 */
export async function getUser(_userId, _options) {
  throw new Error('TODO(group1): auth.getUser is not implemented yet');
}

/**
 * getUsersByIds(userIds[]) -> [{ id, fullName }]
 * Display names for Group 2 list views (OQ-22: Group 2 does not read Group 1 tables directly).
 */
export async function getUsersByIds(_userIds) {
  throw new Error('TODO(group1): auth.getUsersByIds is not implemented yet');
}
