import { describe, expect, it } from 'vitest';

import {
  fullUrlFromPreviewUrl,
  isHttpsFullSableCssUrl,
  previewUrlFromFullThemeUrl,
} from './previewUrls';

describe('previewUrls', () => {
  it('isHttpsFullSableCssUrl matches full tweak/theme CSS links only', () => {
    expect(isHttpsFullSableCssUrl('https://x/tweaks/rounded.sable.css')).toBe(true);
    expect(isHttpsFullSableCssUrl('http://x/y.sable.css')).toBe(false);
    expect(isHttpsFullSableCssUrl('https://x/y.preview.sable.css')).toBe(false);
  });

  it('previewUrlFromFullThemeUrl derives preview asset URL', () => {
    expect(
      previewUrlFromFullThemeUrl(
        'https://raw.githubusercontent.com/SableClient/themes/main/foo.sable.css'
      )
    ).toBe('https://raw.githubusercontent.com/SableClient/themes/main/foo.preview.sable.css');
    expect(previewUrlFromFullThemeUrl('https://x/y')).toBeUndefined();
  });

  it('fullUrlFromPreviewUrl prefers metadata URL when https', () => {
    expect(fullUrlFromPreviewUrl('https://a/p.preview.sable.css', 'https://b/full.sable.css')).toBe(
      'https://b/full.sable.css'
    );
  });

  it('fullUrlFromPreviewUrl derives full URL from preview path', () => {
    expect(
      fullUrlFromPreviewUrl(
        'https://raw.githubusercontent.com/SableClient/themes/main/foo.preview.sable.css'
      )
    ).toBe('https://raw.githubusercontent.com/SableClient/themes/main/foo.sable.css');
  });
});
