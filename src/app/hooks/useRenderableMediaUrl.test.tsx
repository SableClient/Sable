/* oxlint-disable vitest/require-mock-type-parameters */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaTransport = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
  getCurrentMediaSessionScope: vi.fn(() => 'anonymous'),
}));

vi.mock('$utils/mediaTransport', () => mediaTransport);

const makeDeferred = <T,>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

describe('useRenderableMediaUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    mediaTransport.fetchMediaBlob.mockReset();
    mediaTransport.getCurrentMediaSessionScope.mockReset();
    mediaTransport.getCurrentMediaSessionScope.mockReturnValue('anonymous');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rendered-media');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        ready: Promise.resolve({}),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a blob url for browser-safe media urls', async () => {
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    await waitFor(() => {
      expect(result.current).toBe('blob:rendered-media');
    });

    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledWith('https://example.org/media.png');
  }, 20_000);

  it('rejects non-browser-safe media urls', async () => {
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');
    const javascriptUrlValue = ['javascript', 'alert(1)'].join(':');

    const javascriptUrl = renderHook(() => useRenderableMediaUrl(javascriptUrlValue));
    const mxcUrl = renderHook(() => useRenderableMediaUrl('mxc://example.org/media-id'));
    const relativeUrl = renderHook(() => useRenderableMediaUrl('/relative/path.png'));

    expect(javascriptUrl.result.current).toBeUndefined();
    expect(mxcUrl.result.current).toBeUndefined();
    expect(relativeUrl.result.current).toBeUndefined();
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
  });

  it('does not fetch invalid media urls', async () => {
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('data:text/html,boom'));

    expect(result.current).toBeUndefined();
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('returns existing blob urls unchanged', async () => {
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() =>
      useRenderableMediaUrl('blob:http://localhost:8080/blob-id')
    );

    expect(result.current).toBe('blob:http://localhost:8080/blob-id');
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('refetches blob-backed media when the active session changes', async () => {
    mediaTransport.fetchMediaBlob
      .mockResolvedValueOnce(new Blob(['alice'], { type: 'image/png' }))
      .mockResolvedValueOnce(new Blob(['bob'], { type: 'image/png' }));
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:alice-media')
      .mockReturnValueOnce('blob:bob-media');

    const { activeSessionIdAtom } = await import('$state/sessions');
    const store = createStore();
    store.set(activeSessionIdAtom, '@alice:example.org');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toBe('blob:alice-media');
    });

    act(() => {
      store.set(activeSessionIdAtom, '@bob:example.org');
    });

    expect(result.current).toBeUndefined();

    await waitFor(() => {
      expect(result.current).toBe('blob:bob-media');
    });

    expect(mediaTransport.fetchMediaBlob).toHaveBeenNthCalledWith(
      1,
      'https://example.org/media.png'
    );
    expect(mediaTransport.fetchMediaBlob).toHaveBeenNthCalledWith(
      2,
      'https://example.org/media.png'
    );
  });

  it('retains the object url when the last consumer unmounts', async () => {
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { getRenderableMediaUrlStats, useRenderableMediaUrl } =
      await import('./useRenderableMediaUrl');

    const first = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));
    const second = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    await waitFor(() => {
      expect(first.result.current).toBe('blob:rendered-media');
      expect(second.result.current).toBe('blob:rendered-media');
    });

    first.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    second.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 1, inflightCount: 0 });
  });

  it('revokes retained object urls when the cache is cleared', async () => {
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { clearRenderableMediaUrlCache, useRenderableMediaUrl } =
      await import('./useRenderableMediaUrl');

    const { result, unmount } = renderHook(() =>
      useRenderableMediaUrl('https://example.org/media.png')
    );

    await waitFor(() => {
      expect(result.current).toBe('blob:rendered-media');
    });

    unmount();
    clearRenderableMediaUrlCache();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:rendered-media');
  });

  it('keeps mounted object urls usable when the cache is cleared', async () => {
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { clearRenderableMediaUrlCache, getRenderableMediaUrlStats, useRenderableMediaUrl } =
      await import('./useRenderableMediaUrl');

    const { result, unmount } = renderHook(() =>
      useRenderableMediaUrl('https://example.org/media.png')
    );

    await waitFor(() => {
      expect(result.current).toBe('blob:rendered-media');
    });

    clearRenderableMediaUrlCache();

    expect(result.current).toBe('blob:rendered-media');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 1, inflightCount: 0 });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:rendered-media');
    expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 0, inflightCount: 0 });
  });

  it('prewarms renderable media urls for later consumers', async () => {
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { getRenderableMediaUrlStats, prewarmRenderableMediaUrls, useRenderableMediaUrl } =
      await import('./useRenderableMediaUrl');

    await prewarmRenderableMediaUrls(['https://example.org/media.png']);

    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledTimes(1);
    expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 1, inflightCount: 0 });

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    await waitFor(() => {
      expect(result.current).toBe('blob:rendered-media');
    });
    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledTimes(1);
  });

  it('does not let a cleared in-flight request delete a newer cache entry', async () => {
    const firstFetch = makeDeferred<Blob>();
    const secondFetch = makeDeferred<Blob>();
    mediaTransport.fetchMediaBlob
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:old-rendered-media')
      .mockReturnValueOnce('blob:new-rendered-media');

    const {
      clearRenderableMediaUrlCache,
      getRenderableMediaUrlStats,
      prewarmRenderableMediaUrls,
      useRenderableMediaUrl,
    } = await import('./useRenderableMediaUrl');

    const warmup = prewarmRenderableMediaUrls(['https://example.org/media.png']);
    clearRenderableMediaUrlCache();

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));
    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledTimes(2);

    firstFetch.resolve(new Blob(['old-media'], { type: 'image/png' }));
    await warmup;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-rendered-media');

    secondFetch.resolve(new Blob(['new-media'], { type: 'image/png' }));

    await waitFor(() => {
      expect(result.current).toBe('blob:new-rendered-media');
    });

    expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 1, inflightCount: 0 });
  });

  it('does not let a failed old consumer release a newer cache entry', async () => {
    const firstFetch = makeDeferred<Blob>();
    const secondFetch = makeDeferred<Blob>();
    mediaTransport.fetchMediaBlob
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:new-rendered-media');

    const { clearRenderableMediaUrlCache, getRenderableMediaUrlStats, useRenderableMediaUrl } =
      await import('./useRenderableMediaUrl');

    const first = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));
    firstFetch.reject(new Error('network failed'));

    await waitFor(() => {
      expect(first.result.current).toBeUndefined();
      expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledTimes(1);
      expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 0, inflightCount: 0 });
    });

    const second = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));
    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledTimes(2);

    first.unmount();

    secondFetch.resolve(new Blob(['new-media'], { type: 'image/png' }));

    await waitFor(() => {
      expect(second.result.current).toBe('blob:new-rendered-media');
    });

    clearRenderableMediaUrlCache();

    expect(second.result.current).toBe('blob:new-rendered-media');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:new-rendered-media');
    expect(getRenderableMediaUrlStats()).toEqual({ cacheSize: 1, inflightCount: 0 });
  });
});
