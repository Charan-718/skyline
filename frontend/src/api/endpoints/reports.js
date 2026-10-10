import { api } from '../client';

export const reportsApi = {
  events: (clubId) => api.get(`/clubs/${clubId}/reports/events`),
  memberships: (clubId) => api.get(`/clubs/${clubId}/reports/memberships`),
  merchandise: (clubId) => api.get(`/clubs/${clubId}/reports/merchandise`),
  finance: (clubId) => api.get(`/clubs/${clubId}/reports/finance`),
};

export const devApi = {
  outbox: (query) => api.get('/dev/outbox', query),
  runJob: (jobName, body) => api.post(`/dev/jobs/${jobName}/run`, body),
  collegeMock: () => api.get('/dev/college-mock'),
  autopayCandidates: () => api.get('/dev/autopay-candidates'),
  reset: () => api.post('/dev/reset'),
};
