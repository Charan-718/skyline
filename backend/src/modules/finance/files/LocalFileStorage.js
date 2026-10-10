import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Stores files under `${root}/receipts/yyyy/mm/<uuid>.<ext>` with mode 0640 (LLD §8).
// Keys are generated here, never taken from the client, and always resolve inside `root`.

const EXT = /^(jpg|png|pdf)$/;

export function createLocalFileStorage({ root, clock }) {
  const base = path.resolve(root);

  function resolveKey(key) {
    const full = path.resolve(base, key);
    if (!full.startsWith(`${base}${path.sep}`)) throw new Error('storage key escapes the upload root');
    return full;
  }

  return Object.freeze({
    async save(buffer, { ext }) {
      if (!EXT.test(ext)) throw new TypeError(`unsupported extension ${ext}`);
      const now = clock.now();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const key = `receipts/${yyyy}/${mm}/${randomUUID()}.${ext}`;
      const full = resolveKey(key);
      await mkdir(path.dirname(full), { recursive: true, mode: 0o750 });
      await writeFile(full, buffer, { mode: 0o640, flag: 'wx' });
      return key;
    },
    createReadStream(key) {
      return createReadStream(resolveKey(key));
    },
    async remove(key) {
      await rm(resolveKey(key), { force: true });
    },
    pathOf: resolveKey,
  });
}
