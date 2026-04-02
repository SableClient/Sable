import { afterEach, describe, expect, it, vi } from 'vitest';
import { listThemePairsFromCatalog } from './catalog';

describe('listThemePairsFromCatalog', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('pairs preview and full theme files from GitHub contents response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          name: 'rose-pine.preview.sable.css',
          path: 'rose-pine.preview.sable.css',
          type: 'file',
          download_url: 'https://raw.githubusercontent.com/SableClient/themes/main/rose-pine.preview.sable.css',
        },
        {
          name: 'rose-pine.sable.css',
          path: 'rose-pine.sable.css',
          type: 'file',
          download_url: 'https://raw.githubusercontent.com/SableClient/themes/main/rose-pine.sable.css',
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          download_url: null,
        },
      ],
    });

    const base = 'https://raw.githubusercontent.com/SableClient/themes/main/';
    const pairs = await listThemePairsFromCatalog(base);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].basename).toBe('rose-pine');
    expect(pairs[0].fullUrl).toContain('rose-pine.sable.css');
    expect(pairs[0].previewUrl).toContain('rose-pine.preview.sable.css');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/SableClient/themes/contents?ref=main',
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } })
    );
  });

  it('requests nested directory when catalog URL includes a path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    await listThemePairsFromCatalog(
      'https://raw.githubusercontent.com/SableClient/themes/main/dist/themes/'
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/SableClient/themes/contents/dist/themes?ref=main',
      expect.anything()
    );
  });

  it('returns empty array when base URL is not a raw GitHub URL', async () => {
    globalThis.fetch = vi.fn();
    const pairs = await listThemePairsFromCatalog('https://example.com/');
    expect(pairs).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
