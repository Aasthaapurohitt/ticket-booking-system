import client from "./client.js";

export const authApi = {
  register: (payload) => client.post("/auth/register", payload).then((r) => r.data),
  login: (payload) => client.post("/auth/login", payload).then((r) => r.data),
  me: () => client.get("/auth/me").then((r) => r.data),
};

export const eventsApi = {
  list: (params) => client.get("/events", { params }).then((r) => r.data),
  get: (id) => client.get(`/events/${id}`).then((r) => r.data),
  create: (payload) => client.post("/events", payload).then((r) => r.data),
  update: (id, payload) => client.put(`/events/${id}`, payload).then((r) => r.data),
};

export const venuesApi = {
  list: () => client.get("/venues").then((r) => r.data),
  get: (id) => client.get(`/venues/${id}`).then((r) => r.data),
  create: (payload) => client.post("/venues", payload).then((r) => r.data),
};

export const holdsApi = {
  create: (eventId, seatId) => client.post(`/events/${eventId}/holds`, { seatId }).then((r) => r.data),
  release: (eventId, holdId) => client.delete(`/events/${eventId}/holds/${holdId}`).then((r) => r.data),
};

export const bookingsApi = {
  confirm: (eventId, holdIds) => client.post(`/events/${eventId}/bookings`, { holdIds }).then((r) => r.data),
  my: () => client.get("/bookings/my").then((r) => r.data),
  get: (id) => client.get(`/bookings/${id}`).then((r) => r.data),
  cancel: (id) => client.post(`/bookings/${id}/cancel`).then((r) => r.data),
};

export const waitlistApi = {
  join: (eventId, categoryId) => client.post(`/events/${eventId}/waitlist`, { categoryId }).then((r) => r.data),
  my: () => client.get("/waitlist/my").then((r) => r.data),
  confirm: (id) => client.post(`/waitlist/${id}/confirm`).then((r) => r.data),
};

export const organiserApi = {
  events: () => client.get("/organiser/events").then((r) => r.data),
  summary: (eventId) => client.get(`/organiser/events/${eventId}/summary`).then((r) => r.data),
};
