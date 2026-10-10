import { api } from '../client';

export const merchApi = {
  categories: (clubId) => api.get(`/clubs/${clubId}/product-categories`),
  createCategory: (clubId, name) => api.post(`/clubs/${clubId}/product-categories`, { name }),
  products: (clubId, query) => api.get(`/clubs/${clubId}/products`, query),
  product: (productId) => api.get(`/products/${productId}`),
  createProduct: (clubId, body) => api.post(`/clubs/${clubId}/products`, body),
  updateProduct: (productId, body) => api.patch(`/products/${productId}`, body),
  setStatus: (productId, status) => api.post(`/products/${productId}/status`, { status }),
  addVariant: (productId, body) => api.post(`/products/${productId}/variants`, body),
  updateVariant: (variantId, body) => api.patch(`/variants/${variantId}`, body),
  adjustStock: (variantId, body, idempotencyKey) =>
    api.post(`/variants/${variantId}/stock-adjustments`, body, { idempotencyKey }),
  inventory: (clubId) => api.get(`/clubs/${clubId}/inventory`),
  lowStockAlerts: (clubId, query) => api.get(`/clubs/${clubId}/low-stock-alerts`, query),
  quote: (clubId, items) =>
    api.get(`/clubs/${clubId}/orders/quote`, { items: items.map((i) => `${i.variantId}:${i.quantity}`).join(',') }),
  placeOrder: (clubId, body, idempotencyKey) => api.post(`/clubs/${clubId}/orders`, body, { idempotencyKey }),
  cancelOrder: (orderId) => api.post(`/orders/${orderId}/cancel`),
  myOrders: (query) => api.getPage('/me/orders', query),
  myOrder: (orderId) => api.get(`/me/orders/${orderId}`),
  clubOrders: (clubId, query) => api.getPage(`/clubs/${clubId}/orders`, query),
  pickup: (clubId, pickupCode, idempotencyKey) =>
    api.post(`/clubs/${clubId}/pickups`, { pickupCode }, { idempotencyKey }),
};
