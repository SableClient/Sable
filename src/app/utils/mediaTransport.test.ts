/* oxlint-disable vitest/require-mock-type-parameters */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  hasControllingServiceWorker: vi.fn(),
}));

const mediaCache = vi.hoisted(() => {
  const cache = new Map<string, Blob>();
  return {
    cache,
    getFromMediaCache: vi.fn(async (url: string) => cache.get(url)),
    putInMediaCache: vi.fn(async (url: string, blob: Blob) => {
      cache.set(url, blob);
    }),
  };
});
const mediaMetadata = vi.hoisted(() => ({
  getMediaMetadata: vi.fn(async () => undefined),
  getMediaMetadataSnapshot: vi.fn(() => undefined),
  storeMediaMetadataForBlob: vi.fn(async () => undefined),
}));

function pendingResponse() {
  let resolveFetch!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  });

  return { pending, resolveFetch };
}

vi.mock('$utils/platform', () => platform);
vi.mock('./mediaCache', () => mediaCache);
vi.mock('./mediaMetadata', () => mediaMetadata);

describe('fetchMediaBlob', () => {
  const TEST_TIMEOUT = 20_000;

  beforeEach(() => {
    vi.resetModules();
    platform.hasControllingServiceWorker.mockReset();
    platform.hasControllingServiceWorker.mockReturnValue(false);
    mediaCache.cache.clear();
    mediaCache.getFromMediaCache.mockClear();
    mediaCache.putInMediaCache.mockClear();
    mediaMetadata.getMediaMetadata.mockClear();
    mediaMetadata.getMediaMetadata.mockResolvedValue(undefined);
    mediaMetadata.getMediaMetadataSnapshot.mockClear();
    mediaMetadata.getMediaMetadataSnapshot.mockReturnValue(undefined);
    mediaMetadata.storeMediaMetadataForBlob.mockClear();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it(
    'returns cached blobs for default requests',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';
      const cachedBlob = new Blob(['cached'], { type: 'image/png' });
      const scopedUrl = `anonymous:${url}`;
      mediaCache.cache.set(scopedUrl, cachedBlob);

      const blob = await fetchMediaBlob(url);

      expect(blob).toBe(cachedBlob);
      expect(mediaCache.getFromMediaCache).toHaveBeenCalledWith(scopedUrl);
      expect(fetch).not.toHaveBeenCalled();
      expect(mediaCache.putInMediaCache).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'does not remeasure cached blobs when metadata is already in memory',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';
      const cachedBlob = new Blob(['cached'], { type: 'image/png' });
      const scopedUrl = `anonymous:${url}`;
      mediaCache.cache.set(scopedUrl, cachedBlob);
      mediaMetadata.getMediaMetadataSnapshot.mockReturnValue({
        cachedAt: Date.now(),
        height: 60,
        width: 120,
      } as never);

      await expect(fetchMediaBlob(url)).resolves.toBe(cachedBlob);

      expect(mediaMetadata.getMediaMetadataSnapshot).toHaveBeenCalledWith(scopedUrl);
      expect(mediaMetadata.getMediaMetadata).not.toHaveBeenCalled();
      expect(mediaMetadata.storeMediaMetadataForBlob).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'does not remeasure cached blobs when metadata is already persisted',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';
      const cachedBlob = new Blob(['cached'], { type: 'image/png' });
      const scopedUrl = `anonymous:${url}`;
      mediaCache.cache.set(scopedUrl, cachedBlob);
      mediaMetadata.getMediaMetadata.mockResolvedValue({
        cachedAt: Date.now(),
        height: 60,
        width: 120,
      } as never);

      await expect(fetchMediaBlob(url)).resolves.toBe(cachedBlob);

      expect(mediaMetadata.getMediaMetadata).toHaveBeenCalledWith(scopedUrl);
      expect(mediaMetadata.storeMediaMetadataForBlob).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'does not reuse cached blobs across different active sessions',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE',
            accessToken: 'alice-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      const aliceBlob = new Blob(['alice'], { type: 'image/png' });
      vi.mocked(fetch).mockResolvedValueOnce(new Response(aliceBlob, { status: 200 }));

      await expect(fetchMediaBlob(url)).resolves.toEqual(aliceBlob);

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@bob:example.org',
            deviceId: 'DEVICE',
            accessToken: 'bob-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@bob:example.org');

      const bobBlob = new Blob(['bob'], { type: 'image/png' });
      vi.mocked(fetch).mockResolvedValueOnce(new Response(bobBlob, { status: 200 }));

      await expect(fetchMediaBlob(url)).resolves.toEqual(bobBlob);

      expect(fetch).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT
  );

  it.each([
    '/_matrix/media/v3/download/example.org/abc',
    '/_matrix/media/r0/thumbnail/example.org/abc',
    '/_matrix/client/v1/media/download/example.org/abc',
    '/_matrix/client/v3/media/download/example.org/abc',
    '/_matrix/client/r0/media/thumbnail/example.org/abc',
    '/_matrix/client/unstable/org.matrix.msc3916/media/download/example.org/abc',
  ])(
    'attaches the stored token on Matrix media path %s for the signed-in homeserver',
    async (path) => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = `https://matrix.example.org${path}`;
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE',
            accessToken: 'alice-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual(['Bearer alice-token']);
    },
    TEST_TIMEOUT
  );

  it(
    'never sends the stored token to a non-homeserver media URL',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://evil.example.com/room-controlled-icon.png';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE',
            accessToken: 'alice-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual([null]);
    },
    TEST_TIMEOUT
  );

  it(
    'never sends the stored token to a non-media path on the homeserver origin',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      // Same origin as the signed-in homeserver, but not a Matrix media endpoint.
      const url = 'https://matrix.example.org/_matrix/client/v3/profile/@alice:example.org';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE',
            accessToken: 'alice-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual([null]);
    },
    TEST_TIMEOUT
  );

  it.each([
    '/_matrix/media/v3/config',
    '/_matrix/client/v1/media/foo',
    '/_matrix/media/v3/create',
    // Endpoint-name prefixes without a segment boundary must not match.
    '/_matrix/media/v3/downloaded/foo',
    '/_matrix/client/v1/media/downloadXYZ',
    '/_matrix/media/v3/preview_url_evil',
  ])(
    'never sends the stored token to non-endpoint media-subtree path %s',
    async (path) => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      // On the signed-in homeserver origin and under a media subtree, but NOT one
      // of the whitelisted download/thumbnail/preview_url endpoints.
      const url = `https://matrix.example.org${path}`;
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE',
            accessToken: 'alice-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual([null]);
    },
    TEST_TIMEOUT
  );

  it(
    'sends the matching homeserver token, not the active session token, across signed-in servers',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      // Alice (hs-a) is active, but the media URL targets a second signed-in
      // homeserver (hs-b). The token sent must belong to hs-b, never hs-a.
      const url = 'https://hs-b.example.org/_matrix/client/v1/media/download/hs-b.example.org/xyz';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://hs-a.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE_A',
            accessToken: 'token-hs-a',
          },
          {
            baseUrl: 'https://hs-b.example.org',
            userId: '@alice:hs-b.example.org',
            deviceId: 'DEVICE_B',
            accessToken: 'token-hs-b',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual(['Bearer token-hs-b']);
    },
    TEST_TIMEOUT
  );

  it(
    'prefers the active session token when accounts share a homeserver origin',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/abc';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      // Alice is stored first, but Bob (same homeserver origin) is the active session.
      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@alice:example.org',
            deviceId: 'DEVICE_A',
            accessToken: 'alice-token',
          },
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@bob:example.org',
            deviceId: 'DEVICE_B',
            accessToken: 'bob-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@bob:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual(['Bearer bob-token']);
    },
    TEST_TIMEOUT
  );

  it(
    'attaches the stored token for media under a path-prefixed homeserver base URL',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      // Homeserver discovered with a path prefix; media lives under it.
      const url = 'https://example.org/matrix/_matrix/client/v1/media/download/example.org/abc';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://example.org/matrix',
            userId: '@alice:example.org',
            deviceId: 'DEVICE',
            accessToken: 'alice-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@alice:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
      expect(headersSeen).toEqual(['Bearer alice-token']);
    },
    TEST_TIMEOUT
  );

  it(
    'uses caller-provided auth and cache scope when present',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const getAccessToken = vi.fn(() => 'widget-token');
      const headersSeen: Array<string | null> = [];

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      const blob = await fetchMediaBlob(url, {
        getAccessToken,
        sessionScope: '@widget:example.org',
      });

      expect(blob).toEqual(freshBlob);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
      expect(headersSeen).toEqual(['Bearer widget-token']);
      expect(mediaCache.putInMediaCache).toHaveBeenCalledWith(
        '@widget:example.org:https://example.org/media.png',
        freshBlob
      );
    },
    TEST_TIMEOUT
  );

  it(
    'does not fall back to stored auth when an override getter returns undefined',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const getAccessToken = vi.fn(() => undefined);
      const headersSeen: Array<string | null> = [];

      localStorage.setItem(
        'matrixSessions',
        JSON.stringify([
          {
            baseUrl: 'https://matrix.example.org',
            userId: '@bob:example.org',
            deviceId: 'DEVICE',
            accessToken: 'bob-token',
          },
        ])
      );
      localStorage.setItem('matrixActiveSession', '@bob:example.org');

      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        headersSeen.push(headers.get('authorization'));
        return new Response(freshBlob, { status: 200 });
      });

      const blob = await fetchMediaBlob(url, {
        getAccessToken,
        sessionScope: undefined,
      });

      expect(blob).toEqual(freshBlob);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
      expect(headersSeen).toEqual([null]);
      expect(mediaCache.putInMediaCache).toHaveBeenCalledWith(
        'anonymous:https://example.org/media.png',
        freshBlob
      );
    },
    TEST_TIMEOUT
  );

  it('bypasses cache reads for reload requests but still stores successes', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    const scopedUrl = `anonymous:${url}`;
    mediaCache.cache.set(scopedUrl, new Blob(['stale'], { type: 'image/png' }));
    const freshBlob = new Blob(['fresh'], { type: 'image/png' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(freshBlob, { status: 200 }));

    const blob = await fetchMediaBlob(url, { cache: 'reload' });

    expect(blob).toEqual(freshBlob);
    expect(mediaCache.getFromMediaCache).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mediaCache.putInMediaCache).toHaveBeenCalledWith(scopedUrl, freshBlob);
  });

  it('classifies 400 media failures as degradable client-side errors', async () => {
    const { fetchMediaBlob, isGracefullyDegradableMediaFetchError, MediaFetchError } =
      await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    vi.mocked(fetch).mockResolvedValueOnce(new Response('bad request', { status: 400 }));

    const result = fetchMediaBlob(url);
    await expect(result).rejects.toBeInstanceOf(MediaFetchError);
    const error = await result.catch((caughtError: unknown) => caughtError);
    expect(isGracefullyDegradableMediaFetchError(error)).toBe(true);
    expect(error).toMatchObject({ status: 400, url });
  });

  it('keeps non-400 media failures actionable', async () => {
    const { fetchMediaBlob, isGracefullyDegradableMediaFetchError, MediaFetchError } =
      await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    vi.mocked(fetch).mockResolvedValueOnce(new Response('oops', { status: 500 }));

    const result = fetchMediaBlob(url);
    await expect(result).rejects.toBeInstanceOf(MediaFetchError);
    const error = await result.catch((caughtError: unknown) => caughtError);
    expect(isGracefullyDegradableMediaFetchError(error)).toBe(false);
    expect(error).toMatchObject({ status: 500, url });
  });

  it('skips cache reads and writes for bypass requests', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    const freshBlob = new Blob(['fresh'], { type: 'image/png' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(freshBlob, { status: 200 }));

    const blob = await fetchMediaBlob(url, { cache: 'bypass' });

    expect(blob).toEqual(freshBlob);
    expect(mediaCache.getFromMediaCache).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mediaCache.putInMediaCache).not.toHaveBeenCalled();
  });

  it('stores metadata under a caller-provided metadata key', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    const metadataCacheKey = '@alice:example.org:mxc://example.org/media';
    const freshBlob = new Blob(['fresh'], { type: 'image/png' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(freshBlob, { status: 200 }));

    await expect(fetchMediaBlob(url, { metadataCacheKey })).resolves.toEqual(freshBlob);

    expect(mediaMetadata.storeMediaMetadataForBlob).toHaveBeenCalledWith(
      metadataCacheKey,
      freshBlob
    );
  });

  it('skips metadata storage when metadata keying is disabled', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    const freshBlob = new Blob(['fresh'], { type: 'image/png' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(freshBlob, { status: 200 }));

    await expect(fetchMediaBlob(url, { metadataCacheKey: null })).resolves.toEqual(freshBlob);

    expect(mediaMetadata.storeMediaMetadataForBlob).not.toHaveBeenCalled();
  });

  it('dedupes inflight requests for the same url and cache mode', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    const { pending, resolveFetch } = pendingResponse();
    vi.mocked(fetch).mockReturnValueOnce(pending);

    const promiseA = fetchMediaBlob(url);
    const promiseB = fetchMediaBlob(url);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    resolveFetch(new Response('deduped', { status: 200 }));

    await expect(promiseA).resolves.toHaveProperty('size', 7);
    await expect(promiseB).resolves.toHaveProperty('size', 7);
    expect(mediaCache.putInMediaCache).toHaveBeenCalledTimes(1);
  });

  it('re-resolves auth once after a 401 in direct-fetch mode', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url =
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/auth-media';
    localStorage.setItem(
      'matrixSessions',
      JSON.stringify([
        {
          baseUrl: 'https://matrix.example.org',
          userId: '@alice:example.org',
          deviceId: 'DEVICE',
          accessToken: 'token-1',
        },
      ])
    );
    localStorage.setItem('matrixActiveSession', '@alice:example.org');

    const headersSeen: Array<string | null> = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers.get('authorization'));
      if (headersSeen.length === 1) {
        localStorage.setItem(
          'matrixSessions',
          JSON.stringify([
            {
              baseUrl: 'https://matrix.example.org',
              userId: '@alice:example.org',
              deviceId: 'DEVICE',
              accessToken: 'token-2',
            },
          ])
        );
        return new Response('denied', { status: 401 });
      }
      return new Response('ok', { status: 200 });
    });

    const blob = await fetchMediaBlob(url);

    expect(await blob.text()).toBe('ok');
    expect(headersSeen).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mediaCache.putInMediaCache).toHaveBeenCalledTimes(1);
  });

  it('retries once on the service worker path without direct auth headers', async () => {
    platform.hasControllingServiceWorker.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url =
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/auth-media';

    const headersSeen: Array<string | null> = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers.get('authorization'));
      if (headersSeen.length === 1) {
        return new Response('denied', { status: 403 });
      }
      return new Response('ok', { status: 200 });
    });

    const blob = await fetchMediaBlob(url);

    expect(await blob.text()).toBe('ok');
    expect(headersSeen).toEqual([null, null]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to direct auth when Safari cannot read a service worker media body', async () => {
    platform.hasControllingServiceWorker.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url =
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/auth-media';
    const swResponse = new Response('sw ok', { status: 200 });
    const headersSeen: Array<string | null> = [];
    const cacheModesSeen: Array<RequestCache | undefined> = [];

    vi.spyOn(swResponse, 'blob').mockRejectedValueOnce(new TypeError('Load failed'));
    localStorage.setItem(
      'matrixSessions',
      JSON.stringify([
        {
          baseUrl: 'https://matrix.example.org',
          userId: '@alice:example.org',
          deviceId: 'DEVICE',
          accessToken: 'token-1',
        },
      ])
    );
    localStorage.setItem('matrixActiveSession', '@alice:example.org');

    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers.get('authorization'));
      cacheModesSeen.push(init?.cache);
      if (headersSeen.length === 1) {
        return swResponse;
      }
      return new Response('direct ok', { status: 200 });
    });

    const blob = await fetchMediaBlob(url);

    expect(await blob.text()).toBe('direct ok');
    expect(headersSeen).toEqual([null, 'Bearer token-1']);
    expect(cacheModesSeen).toEqual(['default', 'reload']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('bypasses the service worker path when explicit auth overrides are provided', async () => {
    platform.hasControllingServiceWorker.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url =
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/auth-media';
    const getAccessToken = vi.fn(() => 'widget-token');
    const headersSeen: Array<string | null> = [];

    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers.get('authorization'));
      return new Response('ok', { status: 200 });
    });

    const blob = await fetchMediaBlob(url, {
      getAccessToken,
      sessionScope: '@widget:example.org',
    });

    expect(await blob.text()).toBe('ok');
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(headersSeen).toEqual(['Bearer widget-token']);
  });

  it('uses direct auth fetches when service workers are supported but not controlling', async () => {
    platform.hasControllingServiceWorker.mockReturnValue(false);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url =
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/auth-media';
    const headersSeen: Array<string | null> = [];

    localStorage.setItem(
      'matrixSessions',
      JSON.stringify([
        {
          baseUrl: 'https://matrix.example.org',
          userId: '@alice:example.org',
          deviceId: 'DEVICE',
          accessToken: 'token-1',
        },
      ])
    );
    localStorage.setItem('matrixActiveSession', '@alice:example.org');

    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers.get('authorization'));
      return new Response('ok', { status: 200 });
    });

    const blob = await fetchMediaBlob(url);

    expect(await blob.text()).toBe('ok');
    expect(headersSeen).toEqual(['Bearer token-1']);
  });
});
