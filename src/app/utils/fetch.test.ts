import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeFetch = vi.fn<typeof globalThis.fetch>();
const invoke = vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>();
const isTauri = vi.fn<() => boolean>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  isTauri,
}));

type FramedMeta = {
  status: number;
  statusText: string;
  url: string;
  headers: [string, string][];
};

/** Mirrors `frame_response` in src-tauri/src/network/native_fetch.rs. */
const framedResponse = (body: string, meta: Partial<FramedMeta> = {}): ArrayBuffer => {
  const metaBytes = new TextEncoder().encode(
    JSON.stringify({
      status: 200,
      statusText: 'OK',
      url: 'https://matrix.example.org/_matrix/client/versions',
      headers: [['content-type', 'application/json']],
      ...meta,
    })
  );
  const bodyBytes = new TextEncoder().encode(body);
  const framed = new Uint8Array(4 + metaBytes.byteLength + bodyBytes.byteLength);
  new DataView(framed.buffer).setUint32(0, metaBytes.byteLength, true);
  framed.set(metaBytes, 4);
  framed.set(bodyBytes, 4 + metaBytes.byteLength);
  return framed.buffer;
};

const loopbackResponse = {
  status: 200,
  statusText: 'OK',
  url: 'http://localhost:8008/_matrix/client/versions',
  headers: [['content-type', 'application/json']],
  body: Array.from(new TextEncoder().encode('{"ok":true}')),
};

describe('app fetch wrapper', () => {
  const TEST_TIMEOUT = 20_000;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', nativeFetch);
    isTauri.mockReturnValue(false);
    nativeFetch.mockResolvedValue(new Response('native'));
    invoke.mockImplementation((cmd) => {
      if (cmd === 'native_fetch') return Promise.resolve(framedResponse('{"ok":true}'));
      if (cmd === 'loopback_fetch') return Promise.resolve(loopbackResponse);
      return Promise.resolve(undefined);
    });
  });

  it(
    'uses native fetch on web',
    async () => {
      const { fetch } = await import('./fetch');

      const response = await fetch('https://matrix.example.org/_matrix/client/versions');

      expect(nativeFetch).toHaveBeenCalledWith(
        'https://matrix.example.org/_matrix/client/versions',
        undefined
      );
      expect(invoke).not.toHaveBeenCalled();
      expect(await response.text()).toBe('native');
    },
    TEST_TIMEOUT
  );

  it(
    'uses native fetch for relative URLs in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('/config.json', { method: 'GET' });

      expect(nativeFetch).toHaveBeenCalledWith('/config.json', { method: 'GET' });
      expect(invoke).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'uses native fetch for blob and data URLs in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('blob:https://sable.chat/blob-id');
      await fetch('data:text/plain,hi');

      expect(nativeFetch).toHaveBeenCalledTimes(2);
      expect(invoke).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'uses native_fetch for remote https URLs in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('https://matrix.example.org/_matrix/client/versions');

      expect(invoke).toHaveBeenCalledWith(
        'native_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'GET',
            url: 'https://matrix.example.org/_matrix/client/versions',
          }),
        })
      );
      expect(nativeFetch).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'reads a remote body with a single IPC round trip',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      const response = await fetch('https://matrix.example.org/_matrix/client/versions');

      expect(await response.json()).toEqual({ ok: true });
      expect(invoke).toHaveBeenCalledTimes(1);
    },
    TEST_TIMEOUT
  );

  it(
    'decodes status, statusText, headers and url from the framed response',
    async () => {
      isTauri.mockReturnValue(true);
      invoke.mockResolvedValue(
        framedResponse('nope', {
          status: 404,
          statusText: 'Not Found',
          url: 'https://matrix.example.org/redirected',
          headers: [['content-type', 'text/plain']],
        })
      );
      const { fetch } = await import('./fetch');

      const response = await fetch('https://matrix.example.org/_matrix/client/versions');

      expect(response.status).toBe(404);
      expect(response.statusText).toBe('Not Found');
      expect(response.headers.get('content-type')).toBe('text/plain');
      expect(response.url).toBe('https://matrix.example.org/redirected');
      expect(await response.text()).toBe('nope');
    },
    TEST_TIMEOUT
  );

  it(
    'returns a null body for null-body statuses',
    async () => {
      isTauri.mockReturnValue(true);
      invoke.mockResolvedValue(framedResponse('', { status: 204, statusText: 'No Content' }));
      const { fetch } = await import('./fetch');

      const response = await fetch('https://matrix.example.org/_matrix/client/versions');

      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    },
    TEST_TIMEOUT
  );

  it(
    'sends the request body to native_fetch',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('https://matrix.example.org/_matrix/client/sync', {
        method: 'POST',
        body: '{"lists":{}}',
      });

      expect(invoke).toHaveBeenCalledWith(
        'native_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'POST',
            body: Array.from(new TextEncoder().encode('{"lists":{}}')),
          }),
        })
      );
    },
    TEST_TIMEOUT
  );

  it(
    'aborts native_fetch when the signal aborts after invoke starts',
    async () => {
      isTauri.mockReturnValue(true);
      const controller = new AbortController();
      invoke.mockImplementationOnce(() => {
        controller.abort();
        return new Promise(() => {});
      });
      const { fetch } = await import('./fetch');

      const request = fetch('https://matrix.example.org/_matrix/client/sync', {
        signal: controller.signal,
      });

      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
      const requestId = (
        invoke.mock.calls[0]?.[1] as { request?: { requestId?: string } } | undefined
      )?.request?.requestId;
      expect(invoke).toHaveBeenNthCalledWith(2, 'abort_native_fetch', { requestId });
    },
    TEST_TIMEOUT
  );

  it(
    'uses loopback_fetch for localhost in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      const response = await fetch('http://localhost:8008/_matrix/client/versions');

      expect(invoke).toHaveBeenCalledWith(
        'loopback_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'GET',
            url: 'http://localhost:8008/_matrix/client/versions',
          }),
        })
      );
      expect(nativeFetch).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({ ok: true });
    },
    TEST_TIMEOUT
  );

  it(
    'uses loopback_fetch for 127.0.0.1 in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('http://127.0.0.1:8008/_matrix/client/versions');

      expect(invoke).toHaveBeenCalledWith(
        'loopback_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            url: 'http://127.0.0.1:8008/_matrix/client/versions',
          }),
        })
      );
    },
    TEST_TIMEOUT
  );

  it(
    'uses loopback_fetch for https localhost in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('https://localhost:8448/_matrix/client/versions');

      expect(invoke).toHaveBeenCalledWith(
        'loopback_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            url: 'https://localhost:8448/_matrix/client/versions',
          }),
        })
      );
      expect(nativeFetch).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'uses loopback_fetch for https 127.0.0.1 in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('https://127.0.0.1:8448/_matrix/client/versions');

      expect(invoke).toHaveBeenCalledWith(
        'loopback_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            url: 'https://127.0.0.1:8448/_matrix/client/versions',
          }),
        })
      );
      expect(nativeFetch).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'uses loopback_fetch for [::1] in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('http://[::1]:8008/_matrix/client/versions');

      expect(invoke).toHaveBeenCalledWith(
        'loopback_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            url: 'http://[::1]:8008/_matrix/client/versions',
          }),
        })
      );
    },
    TEST_TIMEOUT
  );

  it(
    'does not invoke loopback_fetch when the signal is already aborted',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');
      const controller = new AbortController();
      controller.abort();

      await expect(
        fetch('http://localhost:8008/_matrix/client/versions', {
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(invoke).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'aborts loopback_fetch when the signal aborts after invoke starts',
    async () => {
      isTauri.mockReturnValue(true);
      const controller = new AbortController();
      invoke.mockImplementationOnce(() => {
        controller.abort();
        return new Promise(() => {});
      });
      const { fetch } = await import('./fetch');

      const request = fetch('http://localhost:8008/_matrix/client/versions', {
        signal: controller.signal,
      });

      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenNthCalledWith(
        1,
        'loopback_fetch',
        expect.objectContaining({
          request: expect.objectContaining({
            requestId: expect.any(String),
          }),
        })
      );
      const loopbackRequestId = (
        invoke.mock.calls[0]?.[1] as { request?: { requestId?: string } } | undefined
      )?.request?.requestId;
      expect(invoke).toHaveBeenNthCalledWith(2, 'abort_loopback_fetch', {
        requestId: loopbackRequestId,
      });
    },
    TEST_TIMEOUT
  );
});
