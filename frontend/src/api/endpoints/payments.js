import { api } from '../client';

export const paymentsApi = {
  get: (paymentId) => api.get(`/payments/${paymentId}`),
  simulate: (paymentId, outcome, idempotencyKey) =>
    api.post(`/payments/${paymentId}/simulate`, { outcome }, { idempotencyKey }),
  mine: (query) => api.getPage('/me/payments', query),
};
