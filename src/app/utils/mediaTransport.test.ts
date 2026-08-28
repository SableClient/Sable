import { beforeEach, describe, expect, it, vi } from 'vitest';

const swMediaAuth = vi.hoisted(() => ({
  getCachedSWMediaAuthSupport: vi.fn<() => boolean | undefined>(),
}));

const mediaCache = vi.hoisted(() => {
  const cache = new Map<string, Blob>();
  return {
    cache,
    getFromMediaCache: vi.fn<(url: string) => Promise<Blob | undefined>>(async (url: string) =>
      cache.get(url)
    ),
    putInMediaCache: vi.fn<(url: string, blob: Blob) => Promise<void>>(
      async (url: string, blob: Blob) => {
        cache.set(url, blob);
      }
    ),
  };
});

const appFetch = vi.hoisted(() => ({
  fetch: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)
  ),
}));

vi.mock('./swMediaAuth', () => swMediaAuth);
vi.mock('$utils/fetch', () => appFetch);
vi.mock('./mediaCache', () => mediaCache);

describe('fetchMediaBlob', () => {
  const TEST_TIMEOUT = 20_000;

  beforeEach(() => {
    vi.resetModules();
    swMediaAuth.getCachedSWMediaAuthSupport.mockReset();
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(false);
    appFetch.fetch.mockClear();
    mediaCache.cache.clear();
    mediaCache.getFromMediaCache.mockClear();
    mediaCache.putInMediaCache.mockClear();
    mediaCache.putInMediaCache.mockImplementation(async (url: string, blob: Blob) => {
      mediaCache.cache.set(url, blob);
    });
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>());
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
      window.dispatchEvent(new Event('sable-session-changed'));

      const bobBlob = new Blob(['bob'], { type: 'image/png' });
      vi.mocked(fetch).mockResolvedValueOnce(new Response(bobBlob, { status: 200 }));

      await expect(fetchMediaBlob(url)).resolves.toEqual(bobBlob);

      expect(fetch).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT
  );

  it('selects the JSON-encoded active session instead of falling back to the first account', async () => {
    const { getActiveMediaSession, getCurrentMediaSessionScope } = await import('./mediaTransport');

    localStorage.setItem(
      'matrixSessions',
      JSON.stringify([
        {
          baseUrl: 'https://matrix.example.org',
          userId: '@alice:example.org',
          deviceId: 'ALICE',
          accessToken: 'alice-token',
        },
        {
          baseUrl: 'https://other.example.org',
          userId: '@bob:example.org',
          deviceId: 'BOB',
          accessToken: 'bob-token',
        },
      ])
    );
    localStorage.setItem('matrixActiveSession', JSON.stringify('@bob:example.org'));

    expect(getActiveMediaSession()).toEqual({
      baseUrl: 'https://other.example.org',
      accessToken: 'bob-token',
      userId: '@bob:example.org',
    });
    expect(getCurrentMediaSessionScope()).toBe('@bob:example.org');
  });

  it(
    'uses caller-provided auth and cache scope when present',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const url = 'https://example.org/media.png';
      const freshBlob = new Blob(['fresh'], { type: 'image/png' });
      const getAccessToken = vi.fn<() => string>(() => 'widget-token');
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
      const getAccessToken = vi.fn<() => string | undefined>(() => undefined);
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

  it('does not return a cached thumbnail for an original-media download', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const downloadUrl =
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/media-id';
    const thumbnailBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });
    const originalBlob = new Blob(['original'], { type: 'image/jpeg' });
    mediaCache.cache.set(
      'anonymous:mxc://example.org/media-id:thumbnail?width=96&height=96',
      thumbnailBlob
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response(originalBlob, { status: 200 }));

    await expect(fetchMediaBlob(downloadUrl)).resolves.toEqual(originalBlob);
    expect(fetch).toHaveBeenCalledWith(downloadUrl, expect.any(Object));
  });

  it('does not wait for persistent cache writes before returning media', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/media.png';
    const freshBlob = new Blob(['fresh'], { type: 'image/png' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(freshBlob, { status: 200 }));
    mediaCache.putInMediaCache.mockReturnValueOnce(new Promise(() => {}));

    await expect(fetchMediaBlob(url)).resolves.toEqual(freshBlob);
    expect(mediaCache.putInMediaCache).toHaveBeenCalledOnce();
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
    let resolveFetch!: (value: Response) => void;
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

  it('does not share an inflight SW request with forced direct auth', async () => {
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/media-id';
    const headersSeen: Array<string | null> = [];
    let resolveSWRequest!: (response: Response) => void;
    const pendingSWRequest = new Promise<Response>((resolve) => {
      resolveSWRequest = resolve;
    });

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
      const authorization = new Headers(init?.headers).get('authorization');
      headersSeen.push(authorization);
      if (authorization === null) return pendingSWRequest;
      return new Response('direct', { status: 200 });
    });

    const ordinaryRequest = fetchMediaBlob(url);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const directRequest = fetchMediaBlob(url, { forceDirectAuth: true });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await expect(directRequest).resolves.toHaveProperty('size', 6);
    expect(headersSeen).toEqual([null, 'Bearer token-1']);

    resolveSWRequest(new Response('ordinary', { status: 200 }));
    await expect(ordinaryRequest).resolves.toHaveProperty('size', 8);
  });

  it('re-resolves auth once after a 401 in direct-fetch mode', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/media-id';
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

  it('does not send stored auth to untrusted origins', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://attacker.example/media.png';
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
    expect(headersSeen).toEqual([null]);
  });

  it('does not send stored auth to non-media paths on the homeserver origin', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://matrix.example.org/not-media.png';
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
    expect(headersSeen).toEqual([null]);
  });

  it('fetches once on the service worker path when it returns an auth error', async () => {
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/auth-media.png';

    const headersSeen: Array<string | null> = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers.get('authorization'));
      return new Response('denied', { status: 403 });
    });

    await expect(fetchMediaBlob(url)).rejects.toThrow('Failed to fetch media: 403');

    expect(headersSeen).toEqual([null]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bypasses the service worker path when explicit auth overrides are provided', async () => {
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://example.org/auth-media.png';
    const getAccessToken = vi.fn<() => string>(() => 'widget-token');
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

  it('bypasses the service worker path when direct auth is forced', async () => {
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(true);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/media-id';
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

    const blob = await fetchMediaBlob(url, { forceDirectAuth: true });

    expect(await blob.text()).toBe('ok');
    expect(headersSeen).toEqual(['Bearer token-1']);
  });

  it('uses direct auth fetches when service workers are supported but not controlling', async () => {
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(false);
    const { fetchMediaBlob } = await import('./mediaTransport');
    const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/media-id';
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

  it(
    'ignores the retry marker when keying the cache so a retried success is reused',
    async () => {
      const { fetchMediaBlob } = await import('./mediaTransport');
      const canonical =
        'https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/abc123?width=96';
      const retried = `${canonical}&__sable_media_retry=2`;

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

      const media = new Blob(['avatar'], { type: 'image/png' });
      vi.mocked(fetch).mockResolvedValueOnce(new Response(media, { status: 200 }));

      await expect(fetchMediaBlob(retried)).resolves.toEqual(media);
      expect(fetch).toHaveBeenCalledOnce();
      expect(mediaCache.putInMediaCache).toHaveBeenCalledWith(
        '@alice:example.org:mxc://example.org/abc123:thumbnail?width=96',
        expect.any(Blob)
      );

      await expect(fetchMediaBlob(canonical)).resolves.toEqual(media);
      expect(fetch).toHaveBeenCalledOnce();
    },
    TEST_TIMEOUT
  );
});

describe('getStableMediaCacheKeyFragment', () => {
  const CANONICAL =
    'https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/abc123?width=96';

  beforeEach(() => {
    vi.resetModules();
  });

  it('drops the retry marker in both its query and fragment forms', async () => {
    const { getStableMediaCacheKeyFragment } = await import('./mediaTransport');

    const expected = getStableMediaCacheKeyFragment(CANONICAL);
    expect(getStableMediaCacheKeyFragment(`${CANONICAL}&__sable_media_retry=2`)).toBe(expected);
    expect(getStableMediaCacheKeyFragment(`${CANONICAL}#__sable_media_retry=2`)).toBe(expected);
  });

  it('still separates different media and different thumbnail sizes', async () => {
    const { getStableMediaCacheKeyFragment } = await import('./mediaTransport');

    expect(getStableMediaCacheKeyFragment(CANONICAL)).not.toBe(
      getStableMediaCacheKeyFragment(CANONICAL.replace('abc123', 'def456'))
    );
    expect(getStableMediaCacheKeyFragment(CANONICAL)).not.toBe(
      getStableMediaCacheKeyFragment(CANONICAL.replace('width=96', 'width=32'))
    );
  });
});

describe('fetchMediaBlob with Tauri protocol URLs', () => {
  const INNER = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/abc123';
  const WRAPPED = `sable-media://localhost/${encodeURIComponent(INNER)}?__sable_media_cache=3&__sable_media_session=%40alice%3Aexample.org`;
  const WRAPPED_WINDOWS = `http://sable-media.localhost/${encodeURIComponent(INNER)}?__sable_media_cache=3`;

  beforeEach(() => {
    vi.resetModules();
    swMediaAuth.getCachedSWMediaAuthSupport.mockReset();
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(false);
    mediaCache.cache.clear();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>());
  });

  it.each([
    ['the Linux and macOS form', WRAPPED],
    ['the Windows and Android form', WRAPPED_WINDOWS],
  ])('fetches the inner http target for %s', async (_label, wrapped) => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const media = new Blob(['ciphertext'], { type: 'application/octet-stream' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(media, { status: 200 }));

    await expect(fetchMediaBlob(wrapped)).resolves.toEqual(media);
    expect(fetch).toHaveBeenCalledWith(INNER, expect.anything());
  });

  it('attaches the access token, which the wrapped form cannot be trusted with', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    localStorage.setItem(
      'matrixSessions',
      JSON.stringify([
        {
          baseUrl: 'https://matrix.example.org',
          userId: '@alice:example.org',
          accessToken: 'alice-token',
        },
      ])
    );
    localStorage.setItem('matrixActiveSession', JSON.stringify('@alice:example.org'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Blob(['x']), { status: 200 }));

    await fetchMediaBlob(WRAPPED);

    expect(fetch).toHaveBeenCalledWith(
      INNER,
      expect.objectContaining({ headers: { Authorization: 'Bearer alice-token' } })
    );
  });

  it('shares one cache entry between the wrapped and unwrapped forms', async () => {
    const { fetchMediaBlob } = await import('./mediaTransport');
    const media = new Blob(['ciphertext'], { type: 'application/octet-stream' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(media, { status: 200 }));

    await expect(fetchMediaBlob(WRAPPED)).resolves.toEqual(media);
    await expect(fetchMediaBlob(INNER)).resolves.toEqual(media);

    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('fetchMediaBlob for encrypted attachments', () => {
  const INNER =
    'https://matrix.example.org/_matrix/client/v1/media/download/example.org/encrypted01';
  const WRAPPED = `sable-media://localhost/${encodeURIComponent(INNER)}?__sable_media_cache=3`;

  beforeEach(() => {
    vi.resetModules();
    swMediaAuth.getCachedSWMediaAuthSupport.mockReset();
    swMediaAuth.getCachedSWMediaAuthSupport.mockReturnValue(false);
    mediaCache.cache.clear();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>());
  });

  it('round-trips a real encrypted attachment through the wrapped URL', async () => {
    const { encryptAttachment, decryptAttachment } = await import('browser-encrypt-attachment');
    const { fetchMediaBlob } = await import('./mediaTransport');

    const contents = 'e2ee attachment contents';
    const plaintext = new TextEncoder().encode(contents);
    const { data: ciphertext, info } = await encryptAttachment(plaintext.buffer as ArrayBuffer);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(ciphertext, { status: 200 }));

    const fetched = await fetchMediaBlob(WRAPPED);
    expect(fetch).toHaveBeenCalledWith(INNER, expect.anything());

    const decrypted = await decryptAttachment(await fetched.arrayBuffer(), info);
    expect(new TextDecoder().decode(decrypted)).toBe(contents);
  });
});
