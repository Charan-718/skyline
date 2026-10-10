import { api } from '../client';

export const authApi = {
  me: () => api.get('/auth/me'),
  login: (body) => api.post('/auth/login', body),
  register: (body) => api.post('/auth/register', body),
  logout: () => api.post('/auth/logout'),
  updateProfile: (body) => api.patch('/me', body),
  getVerification: () => api.get('/me/college-verification'),
  verify: (body) => api.post('/me/college-verification', body),
};
