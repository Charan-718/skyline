import { api } from '../client';

export const financeApi = {
  summary: (clubId, query) => api.get(`/clubs/${clubId}/finance/summary`, query),
  reconciliation: (clubId) => api.get(`/clubs/${clubId}/finance/reconciliation`),
  transactions: (clubId, query) => api.getPage(`/clubs/${clubId}/transactions`, query),
  budgets: (clubId) => api.get(`/clubs/${clubId}/budgets`),
  createBudget: (clubId, body) => api.post(`/clubs/${clubId}/budgets`, body),
  updateBudget: (budgetId, body) => api.patch(`/budgets/${budgetId}`, body),
  expenses: (clubId, query) => api.getPage(`/clubs/${clubId}/expenses`, query),
  myExpenses: () => api.get('/me/expenses'),
  expense: (id) => api.get(`/expenses/${id}`),
  // multipart: fields + `receipt` file (LLD §4.9)
  submitExpense: (clubId, formData, idempotencyKey) =>
    api.post(`/clubs/${clubId}/expenses`, formData, { idempotencyKey }),
  approve: (id, note, idempotencyKey) => api.post(`/expenses/${id}/approve`, { note }, { idempotencyKey }),
  reject: (id, note, idempotencyKey) => api.post(`/expenses/${id}/reject`, { note }, { idempotencyKey }),
  markPaid: (id, body, idempotencyKey) => api.post(`/expenses/${id}/mark-paid`, body, { idempotencyKey }),
  recordIncome: (clubId, body, idempotencyKey) =>
    api.post(`/clubs/${clubId}/income-entries`, body, { idempotencyKey }),
  clubPayments: (clubId, query) => api.getPage(`/clubs/${clubId}/payments`, query),
};
