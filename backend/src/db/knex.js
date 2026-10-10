import knexFactory from 'knex';
import pg from 'pg';

// BIGINT (int8, OID 20) holds paise. Parse to a JS number, refusing anything outside the
// safe-integer range instead of silently losing precision.
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${value} exceeds Number.MAX_SAFE_INTEGER`);
  return n;
});
// DATE (OID 1082) stays a 'YYYY-MM-DD' string: business dates are IST calendar dates, not instants.
pg.types.setTypeParser(1082, (value) => value);

export function createDb({ databaseUrl, poolMax = 20 }) {
  return knexFactory({
    client: 'pg',
    connection: databaseUrl,
    pool: { min: 0, max: poolMax },
  });
}
