import { api } from '../client';

export const clubsApi = {
  list: (query) => api.get('/clubs', query),
  get: (clubId) => api.get(`/clubs/${clubId}`),
  roles: (clubId) => api.get(`/clubs/${clubId}/roles`),
  assignRole: (clubId, body) => api.post(`/clubs/${clubId}/roles`, body),
  revokeRole: (clubId, assignmentId) => api.del(`/clubs/${clubId}/roles/${assignmentId}`),
};
