// FileStorage interface (LLD §8, ADR-016). Binaries never go into PostgreSQL.
//   save(buffer, { ext })      -> storageKey (relative, random, e.g. receipts/2026/11/<uuid>.pdf)
//   createReadStream(key)      -> Readable
//   remove(key)                -> void (missing file is not an error)
// LocalFileStorage is the only implementation; another (e.g. object storage) can be swapped in
// container.js without touching services.

export const FILE_STORAGE_METHODS = Object.freeze(['save', 'createReadStream', 'remove']);

export function assertFileStorage(storage) {
  for (const m of FILE_STORAGE_METHODS) {
    if (typeof storage?.[m] !== 'function') throw new TypeError(`FileStorage is missing ${m}()`);
  }
  return storage;
}
