import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeFetch = vi.fn();
const tauriFetch = vi.fn();
const invoke = vi.fn();
const isTauri = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  isTauri,
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: tauriFetch,
}));

describe('app fetch wrapper', () => {
  const TEST_TIMEOUT = 20_000;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', nativeFetch);
    isTauri.mockReturnValue(false);
    nativeFetch.mockResolvedValue(new Response('native'));
    tauriFetch.mockResolvedValue(new Response('tauri'));
    invoke.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      url: 'http://localhost:8008/_matrix/client/versions',
      headers: [['content-type', 'application/json']],
      body: Array.from(new TextEncoder().encode('{"ok":true}')),
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
      expect(tauriFetch).not.toHaveBeenCalled();
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
      expect(tauriFetch).not.toHaveBeenCalled();
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
      expect(tauriFetch).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT
  );

  it(
    'uses plugin-http for remote https URLs in Tauri',
    async () => {
      isTauri.mockReturnValue(true);
      const { fetch } = await import('./fetch');

      await fetch('https://matrix.example.org/_matrix/client/versions');

      expect(tauriFetch).toHaveBeenCalledTimes(1);
      expect(nativeFetch).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
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
      expect(tauriFetch).not.toHaveBeenCalled();
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
      expect(tauriFetch).not.toHaveBeenCalled();
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
      expect(tauriFetch).not.toHaveBeenCalled();
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
      const loopbackRequestId = invoke.mock.calls[0]?.[1]?.request?.requestId;
      expect(invoke).toHaveBeenNthCalledWith(2, 'abort_loopback_fetch', {
        requestId: loopbackRequestId,
      });
    },
    TEST_TIMEOUT
  );
});
