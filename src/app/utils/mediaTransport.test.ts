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

vi.mock('$utils/platform', () => platform);
vi.mock('./mediaCache', () => mediaCache);

describe('fetchMediaBlob', () => {
  const TEST_TIMEOUT = 20_000;

  beforeEach(() => {
    vi.resetModules();
    platform.hasControllingServiceWorker.mockReset();
    platform.hasControllingServiceWorker.mockReturnValue(false);
    mediaCache.cache.clear();
    mediaCache.getFromMediaCache.mockClear();
    mediaCache.putInMediaCache.mockClear();
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

  it('dedupes inflight requests for the same url and cache mode', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    let resolveFetch: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
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
    const url = 'https://example.org/auth-media.png';
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
    const url = 'https://example.org/auth-media.png';

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

  it('bypasses the service worker path when explicit auth overrides are provided', async () => {
    platform.hasControllingServiceWorker.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/auth-media.png';
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
    const url = 'https://example.org/auth-media.png';
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
