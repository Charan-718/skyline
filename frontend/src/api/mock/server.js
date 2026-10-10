// In-browser demo backend implementing the LLD §4 REST contract. Used only when
// REACT_APP_API_MODE=mock (the default until the Express backend exists).
import { MockError, uid } from './domain';
import { createSeed } from './seed';
import { routes as authRoutes } from './handlers/auth';
import { routes as membershipRoutes } from './handlers/memberships';
import { routes as eventRoutes } from './handlers/events';
import { routes as commsRoutes } from './handlers/announcements';
import { routes as merchRoutes } from './handlers/merchandise';
import { routes as fundRoutes } from './handlers/fundraisers';
import { routes as financeRoutes } from './handlers/finance';
import { routes as devJobRoutes } from './handlers/dev';

const STORAGE_KEY = 'soms.demo.db.v4';
const SESSION_KEY = 'soms.demo.sid';

const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable (private mode) — demo keeps working in memory */
    }
  },
};

let db = null;
function getDb() {
  if (db) return db;
  const raw = storage.get(STORAGE_KEY);
  if (raw) {
    try {
      db = JSON.parse(raw);
    } catch {
      db = null;
    }
  }
  if (!db) {
    db = createSeed();
    persist();
  }
  return db;
}
function persist() {
  try {
    storage.set(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota — ignore */
  }
}
export function resetDemo() {
  db = createSeed();
  persist();
  storage.set(SESSION_KEY, null);
}

const devRoutes = [
  ['POST', '/dev/reset', () => {
    resetDemo();
    return { status: 200, data: { ok: true } };
  }],
];

const table = [...authRoutes, ...membershipRoutes, ...eventRoutes, ...commsRoutes, ...merchRoutes, ...fundRoutes, ...financeRoutes, ...devJobRoutes, ...devRoutes].map(([method, pattern, fn]) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  })}$`);
  return { method, re, keys, fn };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function envelope(status, code, message, details, requestId) {
  return { status, body: { error: { code, message, details: details || {}, requestId } } };
}

function bodyToObject(body) {
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const o = {};
    body.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }
  return body || {};
}

export async function handle({ method, path, query = {}, body, headers = {} }) {
  const requestId = `req_${uid('').slice(1, 9)}`;
  if (process.env.NODE_ENV !== 'test') await sleep(method === 'GET' ? 180 + Math.random() * 220 : 300 + Math.random() * 300);
  const database = getDb();

  let match = null;
  let params = {};
  for (const r of table) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (m) {
      match = r;
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      break;
    }
  }
  if (!match) return envelope(404, 'NOT_FOUND', 'Not found.', null, requestId);

  const sid = storage.get(SESSION_KEY);
  const user = sid ? database.users.find((u) => u.id === sid) || null : null;
  const idemKey = headers['Idempotency-Key'];
  const idemStoreKey = idemKey && `${user?.id || 'anon'}:${idemKey}`;
  if (idemStoreKey && database.idempotency[idemStoreKey]) return database.idempotency[idemStoreKey];

  const ctx = {
    db: database,
    user,
    params,
    query,
    body: bodyToObject(body),
    rawBody: body,
    setSession: (userId) => storage.set(SESSION_KEY, userId),
  };
  try {
    const result = await match.fn(ctx);
    persist();
    const res = result?.status === 204 ? { status: 204, body: null } : { status: result?.status || 200, body: result?.page ? result.page : { data: result?.data } };
    if (idemStoreKey) {
      database.idempotency[idemStoreKey] = res;
      persist();
    }
    return res;
  } catch (e) {
    if (e instanceof MockError) return envelope(e.status, e.code, e.message, e.details, requestId);
    // eslint-disable-next-line no-console
    console.error('[demo backend]', e);
    return envelope(500, 'INTERNAL_ERROR', 'Something went wrong on our side.', null, requestId);
  }
}
