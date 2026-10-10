import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// LLD §1.2 module boundaries, enforced by dependency-cruiser (same as `npm run lint:deps`).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('module boundaries', () => {
  it('dependency-cruiser reports no violations', async () => {
    const bin = path.join(root, 'node_modules/.bin/depcruise');
    const { stdout } = await promisify(execFile)(bin, ['src', '--config', '.dependency-cruiser.cjs', '--output-type', 'err'], {
      cwd: root,
    }).catch((err) => {
      throw new Error(`dependency-cruiser failed:\n${err.stdout}\n${err.stderr}`);
    });
    expect(stdout).toMatch(/no dependency violations found/);
  }, 60000);
});
