function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Map a DB row (snake_case keys) to API shape (camelCase). Bigint stays number when safe. */
export function toCamelCase(row) {
  if (row == null) return row;
  if (Array.isArray(row)) return row.map(toCamelCase);
  if (typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = snakeToCamel(key);
    if (value != null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      if (Array.isArray(value)) {
        out[camel] = value.map((v) => (typeof v === 'object' && v != null ? toCamelCase(v) : v));
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        out[camel] = toCamelCase(value);
      } else {
        out[camel] = value;
      }
    } else if (typeof value === 'string' && /^\d+$/.test(value) && key.endsWith('_paise')) {
      out[camel] = Number(value);
    } else {
      out[camel] = value;
    }
  }
  return out;
}

export function toSnakeCase(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snake] = value;
  }
  return out;
}
