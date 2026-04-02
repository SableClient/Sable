import { describe, expect, it } from 'vitest';

import {
  extractSafePreviewCustomProperties,
  PREVIEW_CARD_SAFE_CUSTOM_PROPERTIES,
} from './previewCss';

describe('extractSafePreviewCustomProperties', () => {
  it('keeps only allowlisted custom properties', () => {
    const css = `
      --sable-primary-main: #abc;
      --sable-bg-container: #111;
      --sable-extra-unused: red;
    `;
    const vars = extractSafePreviewCustomProperties(css);
    expect(vars['--sable-primary-main']).toBe('#abc');
    expect(vars['--sable-bg-container']).toBe('#111');
    expect(vars['--sable-extra-unused']).toBeUndefined();
  });

  it('exports a fixed set of preview keys', () => {
    expect(PREVIEW_CARD_SAFE_CUSTOM_PROPERTIES.has('--sable-primary-main')).toBe(true);
    expect(PREVIEW_CARD_SAFE_CUSTOM_PROPERTIES.size).toBeGreaterThan(0);
  });
});
