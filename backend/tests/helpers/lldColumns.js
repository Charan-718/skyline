// Extracts a table's column names from its LLD §3.1 paragraph:
//   `users` — id; `email text NOT NULL`; …; created_at, updated_at. UNIQUE INDEX on …
// Columns are the first word of each backticked item plus bare words (id, created_at, …),
// up to the first sentence end outside backticks/parentheses. CHECK/index segments are skipped.

const COLUMN = /^[a-z_][a-z0-9_]*$/;

function cutAtSentenceEnd(text) {
  let tick = false;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '`') tick = !tick;
    else if (!tick && ch === '(') depth += 1;
    else if (!tick && ch === ')') depth = Math.max(0, depth - 1);
    else if (!tick && depth === 0 && ch === '.' && (i + 1 === text.length || /\s/.test(text[i + 1]))) return text.slice(0, i);
  }
  return text;
}

function splitSegments(text) {
  const segments = [];
  let tick = false;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '`') tick = !tick;
    else if (!tick && ch === '(') depth += 1;
    else if (!tick && ch === ')') depth = Math.max(0, depth - 1);
    else if (!tick && depth === 0 && ch === ';') {
      segments.push(text.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(text.slice(start));
  return segments.map((s) => s.trim()).filter(Boolean);
}

export function lldTableColumns(lld, table) {
  const line = lld.split('\n').find((l) => l.startsWith(`\`${table}\` — `));
  if (!line) throw new Error(`table ${table} not found in LLD §3.1`);
  const body = cutAtSentenceEnd(line.slice(line.indexOf(' — ') + 3));
  const columns = new Set();
  for (const segment of splitSegments(body)) {
    if (/^(CHECK|UNIQUE|Partial|Index|index|Composite)\b/.test(segment)) continue;
    for (const match of segment.matchAll(/`([^`]+)`/g)) {
      const name = match[1].trim().split(/\s+/)[0];
      if (COLUMN.test(name)) columns.add(name);
    }
    const bare = segment.replace(/`[^`]*`/g, '').replace(/\([^)]*\)/g, '');
    for (const part of bare.split(',')) {
      const word = part.trim();
      if (COLUMN.test(word)) columns.add(word);
    }
  }
  return [...columns].sort();
}
