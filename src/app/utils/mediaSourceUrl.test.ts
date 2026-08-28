import { describe, expect, it } from 'vitest';

import { getTauriMediaSourceUrl } from './mediaSourceUrl';

const SOURCE = 'https://matrix.example.com/_matrix/client/v1/media/download/example.com/abc123';

describe('getTauriMediaSourceUrl', () => {
  it('unwraps the Android protocol URL to its Matrix media source', () => {
    const url = `https://sable-media.localhost/${encodeURIComponent(SOURCE)}?__sable_media_cache=3`;

    expect(getTauriMediaSourceUrl(url)).toBe(SOURCE);
  });

  it('unwraps the Linux and macOS protocol URL to its Matrix media source', () => {
    const url = `sable-media://localhost/${encodeURIComponent(SOURCE)}?__sable_media_cache=3`;

    expect(getTauriMediaSourceUrl(url)).toBe(SOURCE);
  });

  it('passes ordinary URLs through unchanged', () => {
    const url = 'https://example.org/image.png';
    expect(getTauriMediaSourceUrl(url)).toBe(url);
  });

  it('passes blob URLs through unchanged', () => {
    const url = 'blob:https://app.example.org/8f2b1c44-0f1e-4a1c-9b6f-1d2e3f405162';
    expect(getTauriMediaSourceUrl(url)).toBe(url);
  });
});
