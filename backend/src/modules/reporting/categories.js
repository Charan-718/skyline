// Ledger categories as listed in LLD §2.10 (kept here so reporting does not import finance internals).
export const LEDGER_CATEGORY_LIST = Object.freeze({
  IN: Object.freeze(['MEMBERSHIP_DUES', 'MEMBERSHIP_RENEWAL', 'TICKET_SALE', 'MERCH_SALE', 'FUNDRAISER_INCOME']),
  OUT: Object.freeze(['REIMBURSEMENT_PAYOUT', 'DIRECT_EXPENSE']),
});
