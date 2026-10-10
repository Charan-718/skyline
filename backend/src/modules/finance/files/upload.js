import multer from 'multer';
import { appError } from '../../../shared/errors.js';

// multipart/form-data with one optional file field held in memory (LLD §8). Size is capped at
// MAX_UPLOAD_BYTES while streaming (5 MB + 1 byte -> 413 FILE_TOO_LARGE). JSON requests pass
// through untouched. Whether the file is required is decided by the service (RECEIPT_REQUIRED).

export function createUpload({ maxBytes }) {
  return function singleFile(field) {
    const parse = multer({
      storage: multer.memoryStorage(),
      // busboy flags the limit when a file *reaches* fileSize, so allow maxBytes + 1: a file of
      // exactly MAX_UPLOAD_BYTES passes, one byte more is FILE_TOO_LARGE.
      limits: { fileSize: maxBytes + 1, files: 1, fields: 20, fieldSize: 16 * 1024, parts: 25 },
    }).single(field);
    return (req, res, next) =>
      parse(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') return next(appError('FILE_TOO_LARGE', { maxBytes }));
          return next(appError('VALIDATION_FAILED', { fields: [{ path: err.field ?? field, message: err.code }] }));
        }
        next(err);
      });
  };
}
