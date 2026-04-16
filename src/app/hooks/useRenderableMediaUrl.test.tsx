import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  hasServiceWorker: vi.fn(),
  hasControllingServiceWorker: vi.fn(),
}));

const mediaTransport = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
  getCurrentMediaSessionScope: vi.fn(() => 'anonymous'),
}));

vi.mock('$utils/platform', () => platform);
vi.mock('$utils/mediaTransport', () => mediaTransport);

describe('useRenderableMediaUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    platform.hasServiceWorker.mockReset();
    platform.hasControllingServiceWorker.mockReset();
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

  it('returns the original url when a service worker runtime is available', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    platform.hasControllingServiceWorker.mockReturnValue(true);
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    expect(result.current).toBe('https://example.org/media.png');
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
  }, 20_000);

  it('rejects non-browser-safe media urls in service worker runtimes', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    platform.hasControllingServiceWorker.mockReturnValue(true);
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

  it('returns a blob url in no-service-worker runtimes', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
    platform.hasControllingServiceWorker.mockReturnValue(false);
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    await waitFor(() => {
      expect(result.current).toBe('blob:rendered-media');
    });

    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledWith('https://example.org/media.png');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does not fetch invalid media urls in no-service-worker runtimes', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
    platform.hasControllingServiceWorker.mockReturnValue(false);
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('data:text/html,boom'));

    expect(result.current).toBeUndefined();
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('returns existing blob urls unchanged in no-service-worker runtimes', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
    platform.hasControllingServiceWorker.mockReturnValue(false);
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() =>
      useRenderableMediaUrl('blob:http://localhost:8080/blob-id')
    );

    expect(result.current).toBe('blob:http://localhost:8080/blob-id');
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('uses the blob-backed path until the service worker controls the page', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    platform.hasControllingServiceWorker.mockReturnValue(false);
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    await waitFor(() => {
      expect(result.current).toBe('blob:rendered-media');
    });

    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledWith('https://example.org/media.png');
  });

  it('refetches blob-backed media when the active session changes', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
    platform.hasControllingServiceWorker.mockReturnValue(false);
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

  it('revokes the object url when the last consumer unmounts', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
    platform.hasControllingServiceWorker.mockReturnValue(false);
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['media'], { type: 'image/png' }));
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const first = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));
    const second = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    await waitFor(() => {
      expect(first.result.current).toBe('blob:rendered-media');
      expect(second.result.current).toBe('blob:rendered-media');
    });

    first.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    second.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:rendered-media');
  });
});
