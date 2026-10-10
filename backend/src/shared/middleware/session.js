import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from '../../config/index.js';
import { db } from '../../db/knex.js';

const PgSession = connectPgSimple(session);

export function createSessionMiddleware() {
  return session({
    store: new PgSession({
      conObject: {
        connectionString: config.DATABASE_URL,
      },
      tableName: 'user_sessions',
      createTableIfMissing: false,
    }),
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

/** @param {import('express').Request} req */
export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    const prev = { ...req.session };
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.assign(req.session, prev);
      resolve();
    });
  });
}
