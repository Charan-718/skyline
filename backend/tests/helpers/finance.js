import { idemKey } from './testApp.js';
import { PNG } from '../fixtures/files.js';

const H = { 'X-Requested-With': 'soms' };

/** POST /clubs/:clubId/expenses as multipart. file = { buffer, filename } | null. */
export function submitExpense(agent, clubId, fields = {}, { file = { buffer: PNG, filename: 'bill.png' }, key = idemKey() } = {}) {
  const req = agent.post(`/api/v1/clubs/${clubId}/expenses`).set(H).set('Idempotency-Key', key);
  const body = { kind: 'REIMBURSEMENT', title: 'Printing', amountPaise: '25000', incurredOn: '2026-10-28', ...fields };
  for (const [k, v] of Object.entries(body)) if (v !== undefined) req.field(k, String(v));
  if (file) req.attach('receipt', file.buffer, file.filename);
  return req;
}

export const act = (agent, path, body = {}, key = idemKey()) => agent.post(path).set(H).set('Idempotency-Key', key).send(body);
export const approve = (agent, id, body = {}, key) => act(agent, `/api/v1/expenses/${id}/approve`, body, key);
export const reject = (agent, id, body = { note: 'No receipt match' }, key) => act(agent, `/api/v1/expenses/${id}/reject`, body, key);
export const markPaid = (agent, id, body = { payoutReference: 'UPI-123', paidOn: '2026-10-30' }, key) => act(agent, `/api/v1/expenses/${id}/mark-paid`, body, key);

export const ledgerOut = (db, expenseId) => db('financial_transactions').where({ source_type: 'EXPENSE', source_id: expenseId });
