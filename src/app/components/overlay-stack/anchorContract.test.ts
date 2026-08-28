import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [full];
  });
}

const VIEWPORT_DERIVED_RECT = /\by:\s*(window\.)?innerHeight/;

describe('popout anchor contract', () => {
  it('builds every anchor from a measured element', () => {
    const offenders = sourceFiles(srcDir).filter((file) =>
      VIEWPORT_DERIVED_RECT.test(fs.readFileSync(file, 'utf8'))
    );

    expect(offenders.map((file) => path.relative(srcDir, file))).toEqual([]);
  });
});
