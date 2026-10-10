import { pageResponse } from '../../shared/pagination.js';
import { toBudgetDto, toExpenseDto, toTransactionDto } from './dto.js';

// HTTP adapters for expenses, income, budgets and finance reads.

export function createFinanceController({ expenses, income, budgets, summary }) {
  const meta = (req) => ({ requestId: req.id });
  const one = async (e) => toExpenseDto(e, await expenses.describe([e]));

  return Object.freeze({
    async submitExpense(req, res) {
      const { expense } = await expenses.submit(req.actor, req.valid.params.clubId, req.valid.body, req.file, meta(req));
      res.status(201).json({ data: await one(expense) });
    },
    async approve(req, res) {
      res.json({ data: await one(await expenses.decide(req.actor, req.valid.params.id, 'approve', req.valid.body.note, meta(req))) });
    },
    async reject(req, res) {
      res.json({ data: await one(await expenses.decide(req.actor, req.valid.params.id, 'reject', req.valid.body.note, meta(req))) });
    },
    async markPaid(req, res) {
      res.json({ data: await one(await expenses.markPaid(req.actor, req.valid.params.id, req.valid.body, meta(req))) });
    },
    async getExpense(req, res) {
      res.json({ data: await one(await expenses.get(req.actor, req.valid.params.id)) });
    },
    async listClubExpenses(req, res) {
      const { rows, total } = await expenses.listForClub(req.valid.params.clubId, req.valid.query);
      const described = await expenses.describe(rows);
      res.json(pageResponse(rows.map((e) => toExpenseDto(e, described)), req.valid.query, total));
    },
    async listMyExpenses(req, res) {
      const { rows, total } = await expenses.listMine(req.actor, req.valid.query);
      const described = await expenses.describe(rows);
      res.json(pageResponse(rows.map((e) => toExpenseDto(e, described)), req.valid.query, total));
    },
    async downloadReceipt(req, res, next) {
      const { expense, file, ext, stream } = await expenses.receipt(req.actor, req.valid.params.id);
      res.set({
        'Content-Type': file.mime_type,
        'Content-Length': String(file.size_bytes),
        'Content-Disposition': `attachment; filename="receipt-${expense.id}.${ext}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      stream.on('error', next);
      stream.pipe(res);
    },
    async recordIncome(req, res) {
      const row = await income.record(req.actor, req.valid.params.clubId, req.valid.body, req.file, meta(req));
      res.status(201).json({ data: toTransactionDto(row) });
    },
    async listBudgets(req, res) {
      res.json({ data: (await budgets.list(req.valid.params.clubId)).map(toBudgetDto) });
    },
    async createBudget(req, res) {
      res.status(201).json({ data: toBudgetDto(await budgets.create(req.actor, req.valid.params.clubId, req.valid.body, meta(req))) });
    },
    async updateBudget(req, res) {
      res.json({ data: toBudgetDto(await budgets.update(req.actor, req.valid.params.budgetId, req.valid.body, meta(req))) });
    },
    async financeSummary(req, res) {
      res.json({ data: await summary.summary(req.valid.params.clubId, req.valid.query) });
    },
    async transactions(req, res) {
      const { rows, total, names } = await summary.transactions(req.valid.params.clubId, req.valid.query);
      res.json(pageResponse(rows.map((t) => toTransactionDto(t, names)), req.valid.query, total));
    },
    async reconciliation(req, res) {
      res.json({ data: await summary.reconcile(req.valid.params.clubId) });
    },
  });
}
