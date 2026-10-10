import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// docs/LLD.md: mounted at /docs in Compose (LLD_PATH), ../docs from a host checkout.
export function lldPath() {
  const candidates = [
    process.env.LLD_PATH,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/LLD.md'),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`docs/LLD.md not found (tried ${candidates.join(', ')})`);
  return found;
}
