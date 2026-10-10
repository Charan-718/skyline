import { Router } from 'express';

// Dev-only routes (LLD §4.11). Not mounted at all unless dev tools are enabled and
// NODE_ENV is not production, so /dev/* is a plain 404 otherwise.

export function createDevModule({ config }) {
  return Object.freeze({
    routes(routers) {
      const router = Router();
      if (!config.devToolsEnabled) return router;
      for (const r of routers) router.use(r);
      return router;
    },
  });
}
