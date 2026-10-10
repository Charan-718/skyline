import { randomUUID } from 'node:crypto';

// Accept a client X-Request-Id only if it looks like a UUID; otherwise generate one (LLD §9).
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestId() {
  return (req, res, next) => {
    const incoming = req.get('X-Request-Id');
    req.id = incoming && UUID_LIKE.test(incoming) ? incoming.toLowerCase() : randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  };
}
