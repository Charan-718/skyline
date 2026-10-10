// Sample upload payloads identified by their bytes, not their names.

// 1×1 transparent PNG
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// Minimal JFIF header + EOI
export const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

// Windows PE executable header ("MZ" … "PE\0\0"), to be uploaded as "receipt.pdf"
export const EXE = (() => {
  const b = Buffer.alloc(256);
  b.write('MZ', 0, 'ascii');
  b.writeUInt32LE(0x80, 0x3c);
  b.write('PE\0\0', 0x80, 'binary');
  return b;
})();

export const TEXT = Buffer.from('just some text pretending to be a receipt');

/** PDF of exactly `size` bytes (valid magic bytes, padded). */
export function pdfOfSize(size) {
  const b = Buffer.alloc(size, 0x20);
  PDF.copy(b, 0);
  return b;
}
