// audit.record(trx, {...}) — append-only audit_logs row written inside the caller's
// transaction, so the audit entry commits or rolls back with the action (LLD §9).
// Metadata must not contain secrets; it is stored as given.

const ACTION = /^[A-Z][A-Z0-9_]*$/;

export async function record(trx, { actorUserId = null, clubId = null, action, entityType, entityId = null, metadata = {}, requestId = null }) {
  if (!trx) throw new TypeError('audit.record requires a transaction');
  if (!ACTION.test(action ?? '')) throw new TypeError(`audit action must be UPPER_SNAKE_CASE, got ${action}`);
  if (!entityType) throw new TypeError('audit entityType is required');
  const [row] = await trx('audit_logs')
    .insert({
      actor_user_id: actorUserId,
      club_id: clubId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: JSON.stringify(metadata ?? {}),
      request_id: requestId,
    })
    .returning('*');
  return row;
}

export const audit = Object.freeze({ record });
