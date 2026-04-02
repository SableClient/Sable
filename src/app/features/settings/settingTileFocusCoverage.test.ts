import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const getSettingsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return getSettingsFiles(filePath);
    }

    if (!entry.isFile() || !filePath.endsWith('.tsx') || filePath.endsWith('.test.tsx')) {
      return [];
    }

    return [filePath];
  });

describe('settings tile focus coverage', () => {
  it('requires every settings SettingTile to declare a focusId', () => {
    const offenders = getSettingsFiles('src/app/features/settings').flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const matches = [...source.matchAll(/<SettingTile\b(?![^>]*\bfocusId=)/g)];

      return matches.map(() => file);
    });

    expect(offenders).toEqual([]);
  });
});
