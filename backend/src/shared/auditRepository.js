export function createAuditRepository(knex) {
  return {
    async insert(trx, { actorUserId, clubId, action, entityType, entityId, metadata, requestId }) {
      const q = trx || knex;
      await q('audit_logs').insert({
        actor_user_id: actorUserId ?? null,
        club_id: clubId ?? null,
        action,
        entity_type: entityType,
        entity_id: entityId ?? null,
        metadata: metadata ?? {},
        request_id: requestId ?? null,
      });
    },
  };
}
