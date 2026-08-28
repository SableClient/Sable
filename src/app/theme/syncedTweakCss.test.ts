import { describe, expect, it, vi } from 'vitest';

const { getCachedThemeCss, putCachedThemeCss } = vi.hoisted(() => ({
  getCachedThemeCss: vi
    .fn<(url: string) => Promise<string | undefined>>()
    .mockResolvedValue(undefined),
  putCachedThemeCss: vi
    .fn<(url: string, cssText: string) => Promise<void>>()
    .mockResolvedValue(undefined),
}));

vi.mock('./cache', () => ({ getCachedThemeCss, putCachedThemeCss }));

import {
  getEmbeddedLocalTweakCss,
  hydrateSyncedLocalTweakCss,
  resolveSavedTweakCss,
} from './syncedTweakCss';

describe('synced local tweak CSS', () => {
  it('hydrates only embedded local tweak CSS and tolerates cache failures', async () => {
    putCachedThemeCss.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    await expect(
      hydrateSyncedLocalTweakCss([
        {
          fullUrl: 'sable-import://tweak/one/full.sable.css',
          displayName: 'One',
          basename: 'one',
          cssText: 'a {}',
        },
        {
          fullUrl: 'https://example.test/tweak.sable.css',
          displayName: 'Remote',
          basename: 'remote',
          cssText: 'b {}',
        },
      ])
    ).resolves.toBeUndefined();
    expect(putCachedThemeCss).toHaveBeenCalledTimes(1);
  });

  it('provides embedded CSS as a deterministic local-listing fallback only', () => {
    expect(
      getEmbeddedLocalTweakCss({
        fullUrl: 'sable-import://tweak/one/full.sable.css',
        displayName: 'One',
        basename: 'one',
        cssText: 'a {}',
      })
    ).toBe('a {}');
    expect(
      getEmbeddedLocalTweakCss({
        fullUrl: 'https://example.test/tweak.sable.css',
        displayName: 'Remote',
        basename: 'remote',
        cssText: 'b {}',
      })
    ).toBeUndefined();
  });

  it('resolves embedded local CSS for saved-tweak rendering when cache reads and writes fail', async () => {
    const favorite = {
      fullUrl: 'sable-import://tweak/one/full.sable.css',
      displayName: 'One',
      basename: 'one',
      cssText: 'a {}',
    };
    getCachedThemeCss.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    putCachedThemeCss.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    await expect(resolveSavedTweakCss(favorite)).resolves.toBe('a {}');
  });

  it('prefers newer embedded local CSS over stale cached CSS', async () => {
    getCachedThemeCss.mockResolvedValueOnce('stale {}');
    const callsBefore = getCachedThemeCss.mock.calls.length;
    await expect(
      resolveSavedTweakCss({
        fullUrl: 'sable-import://tweak/one/full.sable.css',
        displayName: 'One',
        basename: 'one',
        cssText: 'new {}',
      })
    ).resolves.toBe('new {}');
    expect(getCachedThemeCss).toHaveBeenCalledTimes(callsBefore);
  });
});
