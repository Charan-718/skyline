import { inspectFile, extensionFor } from './inspect.js';
import * as repository from './repository.js';

// File handling for finance (T-80). Flow (LLD §5.11): inspect bytes → store the file → caller's
// transaction inserts uploaded_files + its own rows → on transaction failure the stored file is
// deleted (compensating action).

export function createFileService({ db, storage, maxBytes, logger }) {
  async function withStoredFile(file, { clubId, uploadedBy }, work) {
    const inspected = await inspectFile(file, { maxBytes });
    const storageKey = await storage.save(inspected.buffer, { ext: inspected.ext });
    try {
      return await work(async (trx) =>
        repository.insertFile(trx, {
          club_id: clubId,
          uploaded_by: uploadedBy,
          purpose: 'RECEIPT',
          original_name: inspected.originalName,
          storage_key: storageKey,
          mime_type: inspected.mimeType,
          size_bytes: inspected.sizeBytes,
          sha256: inspected.sha256,
        }),
      );
    } catch (err) {
      try {
        await storage.remove(storageKey);
      } catch (removeErr) {
        logger.error({ err: removeErr, storageKey }, 'files: failed to delete file after a failed transaction');
      }
      throw err;
    }
  }

  async function openForDownload(fileId) {
    const file = await repository.findFile(db, fileId);
    if (!file) return null;
    return { file, ext: extensionFor(file.mime_type), stream: storage.createReadStream(file.storage_key) };
  }

  return Object.freeze({ withStoredFile, openForDownload, inspect: (file) => inspectFile(file, { maxBytes }) });
}
