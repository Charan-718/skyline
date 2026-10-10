import { api } from '../client';

export const membershipsApi = {
  plans: (clubId, query) => api.get(`/clubs/${clubId}/plans`, query),
  createPlan: (clubId, body) => api.post(`/clubs/${clubId}/plans`, body),
  updatePlan: (planId, body) => api.patch(`/plans/${planId}`, body),
  archivePlan: (planId) => api.post(`/plans/${planId}/archive`),
  join: (clubId, body, idempotencyKey) => api.post(`/clubs/${clubId}/memberships`, body, { idempotencyKey }),
  mine: () => api.get('/me/memberships'),
  detail: (id) => api.get(`/me/memberships/${id}`),
  renew: (id, body, idempotencyKey) => api.post(`/me/memberships/${id}/renewals`, body, { idempotencyKey }),
  setAutopay: (id, body) => api.put(`/me/memberships/${id}/autopay`, body),
  digitalId: (id) => api.get(`/me/memberships/${id}/digital-id`),
  rotateDigitalId: (id) => api.post(`/me/memberships/${id}/digital-id/rotate`),
  verifyQr: (qrPayload) => api.post('/membership-verifications', { qrPayload }),
  clubMembers: (clubId, query) => api.getPage(`/clubs/${clubId}/memberships`, query),
};
