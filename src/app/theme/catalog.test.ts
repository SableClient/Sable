import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchThemeCatalogBundle,
  listThemePairsFromCatalog,
  themeCatalogManifestUrlFromBase,
} from './catalog';

describe('themeCatalogManifestUrlFromBase', () => {
  it('resolves catalog.json beside raw root', () => {
    expect(
      themeCatalogManifestUrlFromBase('https://raw.githubusercontent.com/SableClient/themes/main/')
    ).toBe('https://raw.githubusercontent.com/SableClient/themes/main/catalog.json');
    expect(
      themeCatalogManifestUrlFromBase('https://raw.githubusercontent.com/SableClient/themes/main')
    ).toBe('https://raw.githubusercontent.com/SableClient/themes/main/catalog.json');
  });

  it('resolves under nested path', () => {
    expect(
      themeCatalogManifestUrlFromBase(
        'https://raw.githubusercontent.com/SableClient/themes/main/dist/themes/'
      )
    ).toBe('https://raw.githubusercontent.com/SableClient/themes/main/dist/themes/catalog.json');
  });
});

describe('listThemePairsFromCatalog', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('loads pairs from catalog.json manifest when present', async () => {
    const base = 'https://raw.githubusercontent.com/SableClient/themes/main/';
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        themes: [
          {
            basename: 'rose-pine',
            previewUrl:
              'https://raw.githubusercontent.com/SableClient/themes/main/themes/rose-pine.preview.sable.css',
            fullUrl:
              'https://raw.githubusercontent.com/SableClient/themes/main/themes/rose-pine.sable.css',
          },
        ],
      }),
    } as unknown as Response);

    const pairs = await listThemePairsFromCatalog(base);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.basename).toBe('rose-pine');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/SableClient/themes/main/catalog.json',
      expect.objectContaining({ mode: 'cors' })
    );
  });

  it('uses custom manifest URL when provided', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        themes: [
          {
            basename: 'x',
            previewUrl: 'https://cdn.example/p.preview.sable.css',
            fullUrl: 'https://cdn.example/p.sable.css',
          },
        ],
      }),
    } as unknown as Response);

    const pairs = await listThemePairsFromCatalog(
      'https://raw.githubusercontent.com/SableClient/themes/main/',
      {
        manifestUrl: 'https://pages.example.com/catalog.json',
      }
    );

    expect(pairs[0]?.basename).toBe('x');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pages.example.com/catalog.json',
      expect.anything()
    );
  });

  it('returns empty array when manifest is valid but themes is empty', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, themes: [] }),
    } as unknown as Response);

    const pairs = await listThemePairsFromCatalog(
      'https://raw.githubusercontent.com/SableClient/themes/main/'
    );
    expect(pairs).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GitHub contents API when manifest fetch fails', async () => {
    const mock = vi.fn<typeof fetch>();
    globalThis.fetch = mock;
    mock
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: 'rose-pine.preview.sable.css',
            path: 'themes/rose-pine.preview.sable.css',
            type: 'file',
            download_url:
              'https://raw.githubusercontent.com/SableClient/themes/main/themes/rose-pine.preview.sable.css',
          },
          {
            name: 'rose-pine.sable.css',
            path: 'themes/rose-pine.sable.css',
            type: 'file',
            download_url:
              'https://raw.githubusercontent.com/SableClient/themes/main/themes/rose-pine.sable.css',
          },
        ],
      } as unknown as Response);

    const base = 'https://raw.githubusercontent.com/SableClient/themes/main/';
    const pairs = await listThemePairsFromCatalog(base);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.basename).toBe('rose-pine');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/SableClient/themes/main/catalog.json',
      expect.objectContaining({ mode: 'cors' })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/SableClient/themes/contents/themes?ref=main',
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } })
    );
  });

  it('requests nested directory when catalog URL includes a path and manifest is missing', async () => {
    const mock = vi.fn<typeof fetch>();
    globalThis.fetch = mock;
    mock
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as unknown as Response);

    await listThemePairsFromCatalog(
      'https://raw.githubusercontent.com/SableClient/themes/main/dist/themes/'
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/SableClient/themes/main/dist/themes/catalog.json',
      expect.anything()
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/SableClient/themes/contents/dist/themes/themes?ref=main',
      expect.anything()
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/SableClient/themes/contents/dist/themes/tweaks?ref=main',
      expect.anything()
    );
  });

  it('returns empty array when base URL is not a raw GitHub URL and manifest fails', async () => {
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const pairs = await listThemePairsFromCatalog('https://example.com/');
    expect(pairs).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/catalog.json',
      expect.anything()
    );
  });

  it('loads tweaks from manifest when themes array is empty', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        themes: [],
        tweaks: [
          {
            basename: 'rounded',
            fullUrl:
              'https://raw.githubusercontent.com/SableClient/themes/main/tweaks/rounded.sable.css',
          },
        ],
      }),
    } as unknown as Response);
    const base = 'https://raw.githubusercontent.com/SableClient/themes/main/';
    const bundle = await fetchThemeCatalogBundle(base);
    expect(bundle.themes).toEqual([]);
    expect(bundle.tweaks).toHaveLength(1);
    expect(bundle.tweaks[0]?.basename).toBe('rounded');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('loads tweaks from GitHub tweaks/ when manifest is missing', async () => {
    const mock = vi.fn<typeof fetch>();
    globalThis.fetch = mock;
    mock
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: 'rounded.sable.css',
            path: 'tweaks/rounded.sable.css',
            type: 'file',
            download_url:
              'https://raw.githubusercontent.com/SableClient/themes/main/tweaks/rounded.sable.css',
          },
        ],
      } as unknown as Response);
    const base = 'https://raw.githubusercontent.com/SableClient/themes/main/';
    const bundle = await fetchThemeCatalogBundle(base);
    expect(bundle.themes).toEqual([]);
    expect(bundle.tweaks).toHaveLength(1);
    expect(bundle.tweaks[0]?.basename).toBe('rounded');
  });
});
