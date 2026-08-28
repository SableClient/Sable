import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { settingsLinkFocusIdsBySection } from './settingsLink';
import { settingsSections, type SettingsSectionId } from './routes';

const SETTINGS_DIR = 'src/app/features/settings';

// --- directory → section id mapping ---
const dirToSection: Record<string, SettingsSectionId> = {
  account: 'account',
  accessibility: 'accessibility',
  Persona: 'persona',
  cosmetics: 'appearance',
  notifications: 'notifications',
  'keyboard-shortcuts': 'keyboard-shortcuts',
  devices: 'devices',
  desktop: 'desktop',
  'emojis-stickers': 'emojis',
  'developer-tools': 'developer-tools',
  experimental: 'experimental',
  about: 'about',
  general: 'general',
};

const getSettingsComponentFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return getSettingsComponentFiles(filePath);
    }

    if (!entry.isFile() || !filePath.endsWith('.tsx') || filePath.endsWith('.test.tsx')) {
      return [];
    }

    return [filePath];
  });

/** Extract literal focusId="value" strings from a source file. */
const extractLiteralFocusIds = (source: string): string[] => {
  const results: string[] = [];
  // Match focusId="value" (double-quoted literals only — skip template literals)
  const re = /focusId="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const value = match[1];
    if (value) results.push(value);
  }
  return results;
};

describe('settings tile focus coverage', () => {
  // --- canonical link-map checks ---
  describe('settingsLinkFocusIdsBySection', () => {
    it('covers every section', () => {
      for (const section of settingsSections) {
        expect(
          settingsLinkFocusIdsBySection[section.id],
          `section "${section.id}" has no focusIds entry`
        ).toBeDefined();
      }
    });

    it('has unique entries within each section', () => {
      for (const section of settingsSections) {
        const ids = settingsLinkFocusIdsBySection[section.id];
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const id of ids) {
          if (seen.has(id)) dupes.push(id);
          seen.add(id);
        }
        expect(dupes, `duplicate focusIds in section "${section.id}"`).toEqual([]);
      }
    });

    it('contains only lowercase-alphanumeric-hyphen entries matching the focusId pattern', () => {
      const PATTERN = /^[a-z0-9-]+$/;
      for (const section of settingsSections) {
        const offenders = settingsLinkFocusIdsBySection[section.id].filter(
          (id) => !PATTERN.test(id)
        );
        expect(offenders, `invalid focusId format in section "${section.id}"`).toEqual([]);
      }
    });
  });

  // --- component source checks ---
  describe('component <SettingTile> focusId coverage', () => {
    const files = getSettingsComponentFiles(SETTINGS_DIR);
    const fileContents = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

    // Build the full set of link-map focusIds for cross-reference
    const allLinkMapIds = new Set(Object.values(settingsLinkFocusIdsBySection).flat());

    it('every <SettingTile> and <SettingToggle> tag has a focusId prop', () => {
      const offenders: { file: string; line: number; context: string }[] = [];

      for (const [file, source] of fileContents) {
        // Find <SettingTile and <SettingToggle tags by opening tag
        const tagRe = /<(SettingTile|SettingToggle)\b[^>]*\/?>/g;
        let tagMatch: RegExpExecArray | null;
        while ((tagMatch = tagRe.exec(source)) !== null) {
          const tag = tagMatch[0];
          if (!/\bfocusId=/.test(tag)) {
            const line = source.slice(0, tagMatch.index).split('\n').length;
            offenders.push({ file, line, context: tag.slice(0, 120) });
          }
        }
      }

      expect(offenders, '<SettingTile> or <SettingToggle> tags missing focusId prop').toEqual([]);
    });

    it('focusIds exists for a specific SettingTile', () => {
      const missing: {
        file: string;
        focusId: string;
      }[] = [];

      for (const [file, source] of fileContents) {
        for (const focusId of extractLiteralFocusIds(source)) {
          if (!allLinkMapIds.has(focusId)) {
            missing.push({ file, focusId });
          }
        }
      }
      expect(missing, 'focusId expected to exist in settingsLinkFocusIdsBySection').toEqual([]);
    });

    it('literal focusIds in a component directory belong to the correct section', () => {
      const mismatches: {
        file: string;
        focusId: string;
        expectedSection: SettingsSectionId;
      }[] = [];

      for (const [file, source] of fileContents) {
        // Determine section from file path
        const relativePath = file.replace(SETTINGS_DIR + '/', '');
        const topDir = relativePath.split('/')[0]!;
        const section = dirToSection[topDir];
        if (!section) continue; // e.g., root-level SettingTile definitions like SettingsRoute.tsx

        const sectionIds = new Set(settingsLinkFocusIdsBySection[section]);

        for (const focusId of extractLiteralFocusIds(source)) {
          if (allLinkMapIds.has(focusId) && !sectionIds.has(focusId)) {
            mismatches.push({ file, focusId, expectedSection: section });
          }
        }
      }

      expect(
        mismatches,
        'focusId values in the wrong section (they appear in a directory but belong to a different section in the link map)'
      ).toEqual([]);
    });
  });
});
