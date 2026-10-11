import { api } from '../client';

export const announcementsApi = {
  feed: (query) => api.getPage('/announcements', query),
  clubList: (clubId, query) => api.getPage(`/clubs/${clubId}/announcements`, query),
  get: (id) => api.get(`/announcements/${id}`),
  create: (clubId, body) => api.post(`/clubs/${clubId}/announcements`, body),
  update: (id, body) => api.patch(`/announcements/${id}`, body),
  remove: (id) => api.del(`/announcements/${id}`),
  publish: (id, idempotencyKey) => api.post(`/announcements/${id}/publish`, undefined, { idempotencyKey }),
  deliveries: (id, query) => api.get(`/announcements/${id}/deliveries`, query),
};
