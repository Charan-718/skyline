import { api } from '../client';

export const eventsApi = {
  list: (query) => api.getPage('/events', query),
  clubEvents: (clubId, query) => api.get(`/clubs/${clubId}/events`, query),
  get: (eventId) => api.get(`/events/${eventId}`),
  quote: (eventId) => api.get(`/events/${eventId}/price-quote`),
  create: (clubId, body) => api.post(`/clubs/${clubId}/events`, body),
  update: (eventId, body) => api.patch(`/events/${eventId}`, body),
  publish: (eventId) => api.post(`/events/${eventId}/publish`),
  cancel: (eventId, reason) => api.post(`/events/${eventId}/cancel`, { reason }),
  complete: (eventId) => api.post(`/events/${eventId}/complete`),
  organizers: (eventId) => api.get(`/events/${eventId}/organizers`),
  setOrganizers: (eventId, userIds) => api.put(`/events/${eventId}/organizers`, { userIds }),
  staff: (eventId) => api.get(`/events/${eventId}/staff`),
  addStaff: (eventId, userId) => api.post(`/events/${eventId}/staff`, { userId }),
  removeStaff: (eventId, userId) => api.del(`/events/${eventId}/staff/${userId}`),
  book: (eventId, body, idempotencyKey) => api.post(`/events/${eventId}/bookings`, body, { idempotencyKey }),
  cancelBooking: (bookingId) => api.post(`/bookings/${bookingId}/cancel`),
  bookings: (eventId, query) => api.getPage(`/events/${eventId}/bookings`, query),
  myTickets: (query) => api.get('/me/tickets', query),
  myTicket: (ticketId) => api.get(`/me/tickets/${ticketId}`),
  checkIn: (eventId, qrPayload, idempotencyKey) =>
    api.post(`/events/${eventId}/check-ins`, { qrPayload }, { idempotencyKey }),
  checkIns: (eventId) => api.get(`/events/${eventId}/check-ins`),
  report: (eventId) => api.get(`/events/${eventId}/report`),
  assistant: (eventId) => api.get(`/events/${eventId}/assistant`),
  askAssistant: (eventId, body) => api.post(`/events/${eventId}/assistant`, body),
};
