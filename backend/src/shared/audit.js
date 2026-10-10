export function createAuditService(auditRepository) {
  return {
    async record(trx, entry) {
      await auditRepository.insert(trx, entry);
    },
  };
}
