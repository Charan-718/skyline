import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

// ADR-004 / HLD §8: server-side sessions in PostgreSQL (user_sessions, connect-pg-simple schema),
// cookie `sid`, httpOnly, SameSite=Lax, Secure in production. Group 1 (T-20) owns login/logout,
// which set and clear req.session.userId (OQ-28).

export function createSession({ pool, secret, isProduction, maxAgeMs = 7 * 24 * 60 * 60 * 1000 }) {
  const PgStore = connectPgSimple(session);
  return session({
    name: 'sid',
    store: new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: false }),
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: isProduction,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: maxAgeMs },
  });
}
