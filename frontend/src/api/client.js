// Single API client (LLD §6.3). Both transports — the real Express backend and the in-browser
// demo backend — return the same `{ status, body }` shape, so error handling is identical.
import { API_BASE_URL, API_MODE } from './config';

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message || 'Something went wrong.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'INTERNAL_ERROR';
    this.details = details || {};
    this.requestId = requestId;
  }
}

let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function httpTransport({ method, path, query, body, headers }) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}${buildQuery(query)}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (e) {
    return { status: 0, body: { error: { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection and try again.' } } };
  }
  if (res.status === 204) return { status: 204, body: null };
  const type = res.headers.get('content-type') || '';
  const parsed = type.includes('application/json') ? await res.json().catch(() => null) : null;
  return { status: res.status, body: parsed, requestId: res.headers.get('x-request-id') };
}

let mockTransport = null;
async function getTransport() {
  if (API_MODE !== 'mock') return httpTransport;
  if (!mockTransport) {
    const mod = await import('./mock/server');
    mockTransport = mod.handle;
  }
  return mockTransport;
}

/**
 * request('POST', '/events/1/bookings', { body, idempotencyKey })
 * `idempotencyKey` should be created once per user action and reused on retry.
 */
export async function request(method, path, { query, body, idempotencyKey } = {}) {
  const headers = {};
  if (method !== 'GET') headers['X-Requested-With'] = 'soms';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const transport = await getTransport();
  const res = await transport({ method, path, query, body, headers });

  if (res.status >= 200 && res.status < 300) return res.body;

  const err = res.body?.error || {};
  const apiError = new ApiError({
    status: res.status,
    code: err.code || (res.status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR'),
    message: err.message,
    details: err.details,
    requestId: err.requestId || res.requestId,
  });
  if (res.status === 401 && unauthorizedHandler) unauthorizedHandler(apiError);
  throw apiError;
}

export const api = {
  get: (path, query) => request('GET', path, { query }).then((r) => r?.data ?? r),
  getPage: (path, query) => request('GET', path, { query }),
  post: (path, body, opts = {}) => request('POST', path, { body, ...opts }).then((r) => r?.data ?? r),
  put: (path, body, opts = {}) => request('PUT', path, { body, ...opts }).then((r) => r?.data ?? r),
  patch: (path, body) => request('PATCH', path, { body }).then((r) => r?.data ?? r),
  del: (path) => request('DELETE', path).then((r) => r?.data ?? r),
};
