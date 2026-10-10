import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { TEAM } from '../../shared/access.js';
import * as s from './schemas.js';

// LLD §4.9. Order: requireAuth → multipart → idempotency [IDEM] → validate → authorize → controller.
// The finance summary is the one aggregate TEAM read that includes event organizers (OQ-38).
// Resource routes (/expenses/:id, /budgets/:budgetId) authorize in the service after loading
// the resource's club. Expense submit authorizes in the service because the role depends on kind.

export function createFinanceRoutes({ controller, requireAuth, idempotency, requireClubRole, upload }) {
  const r = Router();
  const CH_TR = ['CLUB_HEAD', 'TREASURER'];

  r.post('/clubs/:clubId/expenses', requireAuth, upload('receipt'), idempotency(), validate({ params: s.clubIdParams, body: s.submitExpenseBody }), controller.submitExpense);
  r.get('/clubs/:clubId/expenses', requireAuth, validate({ params: s.clubIdParams, query: s.expensesQuery }), requireClubRole(CH_TR), controller.listClubExpenses);
  r.get('/me/expenses', requireAuth, validate({ query: s.myExpensesQuery }), controller.listMyExpenses);
  r.get('/expenses/:id', requireAuth, validate({ params: s.idParams }), controller.getExpense);
  r.get('/expenses/:id/receipt', requireAuth, validate({ params: s.idParams }), controller.downloadReceipt);
  r.post('/expenses/:id/approve', requireAuth, idempotency(), validate({ params: s.idParams, body: s.approveBody }), controller.approve);
  r.post('/expenses/:id/reject', requireAuth, idempotency(), validate({ params: s.idParams, body: s.rejectBody }), controller.reject);
  r.post('/expenses/:id/mark-paid', requireAuth, idempotency(), validate({ params: s.idParams, body: s.markPaidBody }), controller.markPaid);

  r.post('/clubs/:clubId/income-entries', requireAuth, upload('evidence'), idempotency(), validate({ params: s.clubIdParams, body: s.incomeEntryBody }), controller.recordIncome);

  r.get('/clubs/:clubId/budgets', requireAuth, validate({ params: s.clubIdParams }), requireClubRole(CH_TR), controller.listBudgets);
  r.post('/clubs/:clubId/budgets', requireAuth, validate({ params: s.clubIdParams, body: s.createBudgetBody }), requireClubRole(['TREASURER']), controller.createBudget);
  r.patch('/budgets/:budgetId', requireAuth, validate({ params: s.budgetIdParams, body: s.patchBudgetBody }), controller.updateBudget);

  r.get('/clubs/:clubId/finance/summary', requireAuth, validate({ params: s.clubIdParams, query: s.summaryQuery }), requireClubRole(TEAM), controller.financeSummary);
  r.get('/clubs/:clubId/transactions', requireAuth, validate({ params: s.clubIdParams, query: s.transactionsQuery }), requireClubRole(CH_TR), controller.transactions);
  r.get('/clubs/:clubId/finance/reconciliation', requireAuth, validate({ params: s.clubIdParams }), requireClubRole(CH_TR), controller.reconciliation);
  return r;
}
