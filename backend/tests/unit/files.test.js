import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectFile, sanitizeOriginalName } from '../../src/modules/finance/files/inspect.js';
import { createLocalFileStorage } from '../../src/modules/finance/files/LocalFileStorage.js';
import { createTestClock } from '../helpers/testClock.js';
import { EXE, JPEG, PDF, PNG, TEXT, pdfOfSize } from '../fixtures/files.js';

const MAX = 5242880;

describe('receipt inspection (LLD §8) — magic bytes, not names', () => {
  it.each([
    ['PNG', PNG, 'image/png', 'png'],
    ['JPEG', JPEG, 'image/jpeg', 'jpg'],
    ['PDF', PDF, 'application/pdf', 'pdf'],
  ])('%s accepted by content', async (_n, buffer, mimeType, ext) => {
    const r = await inspectFile({ buffer, originalname: 'whatever.exe' }, { maxBytes: MAX });
    expect(r).toMatchObject({ mimeType, ext, sizeBytes: buffer.length });
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an .exe renamed .pdf and plain text are UNSUPPORTED_FILE_TYPE', async () => {
    await expect(inspectFile({ buffer: EXE, originalname: 'receipt.pdf' }, { maxBytes: MAX })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE', httpStatus: 415 });
    await expect(inspectFile({ buffer: TEXT, originalname: 'receipt.png' }, { maxBytes: MAX })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('size limit and missing file', async () => {
    await expect(inspectFile({ buffer: pdfOfSize(MAX + 1) }, { maxBytes: MAX })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', httpStatus: 413 });
    await expect(inspectFile({ buffer: pdfOfSize(MAX) }, { maxBytes: MAX })).resolves.toMatchObject({ sizeBytes: MAX });
    await expect(inspectFile(null, { maxBytes: MAX })).rejects.toMatchObject({ code: 'RECEIPT_REQUIRED' });
    await expect(inspectFile({ buffer: Buffer.alloc(0) }, { maxBytes: MAX })).rejects.toMatchObject({ code: 'RECEIPT_REQUIRED' });
  });

  it('original names are sanitised display metadata (no path, no control chars, ≤ 200)', () => {
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalName('C:\\Users\\a\\bill "x".pdf')).toBe('bill x.pdf');
    expect(sanitizeOriginalName('a\u0000b\nc.png')).toBe('abc.png');
    expect(sanitizeOriginalName('')).toBe('receipt');
    expect(sanitizeOriginalName('x'.repeat(300))).toHaveLength(200);
  });
});

describe('LocalFileStorage', () => {
  it('writes random keys under receipts/yyyy/mm with mode 0640 and can delete them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'soms-storage-'));
    const storage = createLocalFileStorage({ root, clock: createTestClock('2026-11-05T10:00:00Z') });
    const a = await storage.save(PNG, { ext: 'png' });
    const b = await storage.save(PNG, { ext: 'png' });
    expect(a).toMatch(/^receipts\/2026\/11\/[0-9a-f-]{36}\.png$/);
    expect(a).not.toBe(b);
    const info = await stat(path.join(root, a));
    expect(info.mode & 0o777).toBe(0o640);
    expect(await readFile(path.join(root, a))).toEqual(PNG);
    await storage.remove(a);
    await expect(stat(path.join(root, a))).rejects.toThrow();
    await storage.remove(a); // idempotent
  });

  it('rejects keys that escape the root and unknown extensions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'soms-storage-'));
    const storage = createLocalFileStorage({ root, clock: createTestClock() });
    expect(() => storage.createReadStream('../../etc/passwd')).toThrow(/escapes/);
    await expect(storage.remove('../outside')).rejects.toThrow(/escapes/);
    await expect(storage.save(PNG, { ext: 'exe' })).rejects.toThrow(/unsupported/);
  });
});
