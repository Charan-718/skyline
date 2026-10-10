import { api } from '../client';

export const fundraisersApi = {
  list: (clubId, query) => api.get(`/clubs/${clubId}/fundraisers`, query),
  create: (clubId, body) => api.post(`/clubs/${clubId}/fundraisers`, body),
  update: (id, body) => api.patch(`/fundraisers/${id}`, body),
  overview: (id) => api.get(`/fundraisers/${id}/overview`),
  createTask: (id, body) => api.post(`/fundraisers/${id}/tasks`, body),
  updateTask: (taskId, body) => api.patch(`/tasks/${taskId}`, body),
  myTasks: (query) => api.get('/me/tasks', query),
};
