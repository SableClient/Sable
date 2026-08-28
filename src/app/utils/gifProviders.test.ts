import { describe, expect, it } from 'vitest';
import {
  GIF_PROVIDERS,
  getGifProvider,
  getGifProviderOptions,
  getProxiedGif,
  isAllowedGifMediaUrl,
} from './gifProviders';

describe('gif provider selection', () => {
  it('falls back to Tenor for a missing or unknown provider', () => {
    expect(getGifProvider(undefined).id).toBe('tenor');
    expect(getGifProvider({ provider: 'giphy' }).id).toBe('giphy');
    expect(getGifProvider({ provider: 'nope' } as never).id).toBe('tenor');
  });

  it('honors a manual override that has a key and ignores one that does not', () => {
    const config = { provider: 'tenor' as const, tenorApiKey: 't', giphyApiKey: 'g' };
    expect(getGifProvider(config, 'giphy').id).toBe('giphy');
    expect(getGifProvider(config, 'klipy').id).toBe('tenor');
    expect(getGifProvider(config, 'default').id).toBe('tenor');
  });

  it('marks providers without a key as unselectable', () => {
    const options = getGifProviderOptions({ provider: 'giphy', giphyApiKey: 'g' });
    expect(options[0]).toEqual({ value: 'default', label: 'Client Default (Giphy)' });
    expect(options.find((option) => option.value === 'giphy')?.disabled).toBe(false);
    expect(options.find((option) => option.value === 'tenor')).toMatchObject({
      label: 'Tenor (no API key)',
      disabled: true,
    });
  });

  it('reads the key belonging to the selected provider', () => {
    const config = { klipyApiKey: 'k', tenorApiKey: 't', giphyApiKey: 'g' };
    expect(GIF_PROVIDERS.klipy.getApiKey(config)).toBe('k');
    expect(GIF_PROVIDERS.tenor.getApiKey(config)).toBe('t');
    expect(GIF_PROVIDERS.giphy.getApiKey(config)).toBe('g');
  });
});

describe('gif media URL allowlist', () => {
  it('accepts each provider CDN', () => {
    expect(isAllowedGifMediaUrl('https://static.klipy.com/ii/a.gif')).toBe(true);
    expect(isAllowedGifMediaUrl('https://media.tenor.com/abc/a.gif')).toBe(true);
    expect(isAllowedGifMediaUrl('https://media1.tenor.com/abc/a.gif')).toBe(true);
    expect(isAllowedGifMediaUrl('https://media0.giphy.com/media/abc/giphy.gif')).toBe(true);
  });

  it('rejects lookalike hosts, ports, credentials and plain http', () => {
    expect(isAllowedGifMediaUrl('https://media.tenor.com.attacker.example/a.gif')).toBe(false);
    expect(isAllowedGifMediaUrl('https://media.tenor.com:8443/a.gif')).toBe(false);
    expect(isAllowedGifMediaUrl('https://user:pass@media.giphy.com/a.gif')).toBe(false);
    expect(isAllowedGifMediaUrl('http://media.tenor.com/a.gif')).toBe(false);
    expect(isAllowedGifMediaUrl('not a url')).toBe(false);
  });
});

describe('search request building', () => {
  it('sends the Tenor client key alongside the api key', () => {
    const url = new URL(GIF_PROVIDERS.tenor.buildSearchUrl('tenor-key', 'happy cat'));
    expect(url.origin + url.pathname).toBe('https://tenor.googleapis.com/v2/search');
    expect(url.searchParams.get('key')).toBe('tenor-key');
    expect(url.searchParams.get('client_key')).toBe('tenor_web');
    expect(url.searchParams.get('q')).toBe('happy cat');
  });

  it('puts the Klipy key in the path and the Giphy key in the query', () => {
    expect(GIF_PROVIDERS.klipy.buildSearchUrl('klipy-key', 'cat')).toContain(
      '/api/v1/klipy-key/gifs/search'
    );
    expect(
      new URL(GIF_PROVIDERS.giphy.buildSearchUrl('giphy-key', 'cat')).searchParams.get('api_key')
    ).toBe('giphy-key');
  });
});

describe('search response parsing', () => {
  it('parses Tenor results and prefers a sendable rendition', () => {
    const [gif] = GIF_PROVIDERS.tenor.parseResults({
      results: [
        {
          id: 'tenor-1',
          content_description: 'a happy cat',
          itemurl: 'https://tenor.com/view/tenor-1',
          media_formats: {
            gif: {
              url: 'https://media.tenor.com/full.gif',
              dims: [800, 600],
              size: 8 * 1024 * 1024,
            },
            mediumgif: {
              url: 'https://media.tenor.com/medium.gif',
              dims: [400, 300],
              size: 900_000,
            },
            tinygif: { url: 'https://media.tenor.com/tiny.gif', dims: [100, 75], size: 20_000 },
          },
        },
      ],
    });

    expect(gif).toEqual({
      id: 'tenor-1',
      title: 'a happy cat',
      shareUrl: 'https://tenor.com/view/tenor-1',
      mediaUrl: 'https://media.tenor.com/medium.gif',
      preview_url: 'https://media.tenor.com/tiny.gif',
      width: 400,
      height: 300,
      size: 900_000,
      mimetype: 'image/gif',
    });
  });

  it('parses Giphy string dimensions into numbers', () => {
    const [gif] = GIF_PROVIDERS.giphy.parseResults({
      data: [
        {
          id: 'giphy-1',
          title: 'dancing',
          url: 'https://giphy.com/gifs/giphy-1',
          images: {
            original: {
              url: 'https://media0.giphy.com/original.gif',
              width: '480',
              height: '270',
              size: '512000',
            },
            fixed_width: {
              url: 'https://media0.giphy.com/preview.gif',
              width: '200',
              height: '113',
              size: '40000',
            },
          },
        },
      ],
    });

    expect(gif).toMatchObject({
      id: 'giphy-1',
      mediaUrl: 'https://media0.giphy.com/original.gif',
      preview_url: 'https://media0.giphy.com/preview.gif',
      width: 480,
      height: 270,
      size: 512_000,
    });
  });

  it('parses Klipy results and builds a share URL from the slug', () => {
    const [gif] = GIF_PROVIDERS.klipy.parseResults({
      data: {
        data: [
          {
            id: 9_188_075_299_582_436,
            title: 'Reaction',
            slug: 'reaction-gif',
            file: {
              hd: {
                gif: {
                  url: 'https://static.klipy.com/ii/hd.gif',
                  width: 800,
                  height: 600,
                  size: 400_000,
                },
              },
              xs: {
                gif: {
                  url: 'https://static.klipy.com/ii/xs.gif',
                  width: 80,
                  height: 60,
                  size: 5000,
                },
              },
            },
          },
        ],
      },
    });

    expect(gif).toMatchObject({
      id: '9188075299582436',
      shareUrl: 'https://klipy.com/gifs/reaction-gif',
      mediaUrl: 'https://static.klipy.com/ii/hd.gif',
      preview_url: 'https://static.klipy.com/ii/xs.gif',
      width: 800,
    });
  });

  it('returns nothing for malformed payloads', () => {
    expect(GIF_PROVIDERS.tenor.parseResults({})).toEqual([]);
    expect(GIF_PROVIDERS.giphy.parseResults(null)).toEqual([]);
    expect(GIF_PROVIDERS.klipy.parseResults({ data: {} })).toEqual([]);
  });
});

describe('proxy mxc minting', () => {
  const gif = { id: 'id', title: 'GIF', shareUrl: '', mediaUrl: '', width: 1, height: 1 };

  it('uses the url-safe base64 alphabet with no padding', () => {
    const proxied = getProxiedGif(
      { ...gif, mediaUrl: 'https://static.klipy.com/ii/a?b/c~d/e+f/g.gif' },
      'gifs.sable.moe'
    );

    expect(proxied?.mxcUrl.split('klipy_')[1]).toMatch(/^[\w-]+$/);
  });

  it('round-trips through the decoder the proxy uses', () => {
    const path = 'ffd4ac143e6335ac68951b787d3c1902/e8/3a/5LM0jRpL.gif';
    const proxied = getProxiedGif(
      { ...gif, mediaUrl: `https://static.klipy.com/ii/${path}` },
      'gifs.sable.moe'
    );
    const encoded = proxied?.mxcUrl.slice(proxied.mxcUrl.indexOf('_') + 1) ?? '';
    const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/');

    expect(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))).toBe(path);
  });

  it('encodes the Tenor media id, not the /m/ path prefix', () => {
    const full = getProxiedGif(
      { ...gif, mediaUrl: 'https://media1.tenor.com/m/lfDATg4Bhc0AAAAC/happy-cat.gif' },
      'gifs.sable.moe'
    );
    const preview = getProxiedGif(
      { ...gif, mediaUrl: 'https://media.tenor.com/lfDATg4Bhc0AAAAM/happy-cat.gif' },
      'gifs.sable.moe'
    );

    expect(full?.mxcUrl).toBe('mxc://gifs.sable.moe/tenor_bGZEQVRnNEJoYzBBQUFBQw');
    expect(preview?.mxcUrl).toBe('mxc://gifs.sable.moe/tenor_bGZEQVRnNEJoYzBBQUFBTQ');
    expect(full?.mxcUrl).not.toBe('mxc://gifs.sable.moe/tenor_bQ');
  });

  it('encodes the Giphy media id rather than the rendition path', () => {
    const proxied = getProxiedGif(
      {
        ...gif,
        id: 'tphCApwvdtC1VJabZ1',
        mediaUrl: 'https://media4.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3/tphCApwvdtC1VJabZ1/giphy.gif',
      },
      'gifs.sable.moe'
    );

    expect(proxied?.mxcUrl).toBe('mxc://gifs.sable.moe/giphy_dHBoQ0Fwd3ZkdEMxVkphYlox');
  });

  it('needs a configured proxy host', () => {
    expect(
      getProxiedGif({ ...gif, mediaUrl: 'https://media.tenor.com/abc/x.gif' }, '  ')
    ).toBeUndefined();
  });
});
