import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { appError } from '../../../shared/errors.js';

// Receipt validation (LLD §8): the type comes from the bytes (magic numbers), never from the
// client's MIME type or file name. JPEG, PNG and PDF only.

const ALLOWED = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
});

export const extensionFor = (mime) => ALLOWED[mime] ?? null;

/** Keeps a display name only: no path, no control characters, ≤ 200 chars. */
export function sanitizeOriginalName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').trim();
  return (clean || 'receipt').slice(0, 200);
}

/** { buffer, originalname, size } -> { buffer, mimeType, ext, sizeBytes, sha256, originalName } */
export async function inspectFile(file, { maxBytes }) {
  if (!file?.buffer?.length) throw appError('RECEIPT_REQUIRED');
  if (file.buffer.length > maxBytes) throw appError('FILE_TOO_LARGE', { maxBytes });
  const detected = await fileTypeFromBuffer(file.buffer);
  const ext = detected ? extensionFor(detected.mime) : null;
  if (!ext) throw appError('UNSUPPORTED_FILE_TYPE', { allowed: Object.keys(ALLOWED) });
  return {
    buffer: file.buffer,
    mimeType: detected.mime,
    ext,
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    originalName: sanitizeOriginalName(file.originalname),
  };
}
