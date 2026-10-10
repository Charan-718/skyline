// Minimal CORS for the dev frontend origin (LLD §1.3 CORS_ORIGIN). Credentials allowed for
// exactly that origin; anything else gets no CORS headers. In production nginx serves the SPA
// from the same origin, so CORS_ORIGIN is left empty.
const ALLOWED_HEADERS = 'Content-Type, X-Requested-With, Idempotency-Key, X-Request-Id';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

export function cors(allowedOrigin) {
  return (req, res, next) => {
    const origin = req.get('Origin');
    if (allowedOrigin && origin === allowedOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Expose-Headers', 'X-Request-Id');
      res.vary('Origin');
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        res.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
        res.set('Access-Control-Max-Age', '600');
        return res.status(204).end();
      }
    }
    next();
  };
}
