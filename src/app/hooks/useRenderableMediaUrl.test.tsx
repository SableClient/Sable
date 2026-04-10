import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  hasServiceWorker: vi.fn(),
}));

const mediaTransport = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
}));

vi.mock('$utils/platform', () => platform);
vi.mock('$utils/mediaTransport', () => mediaTransport);

describe('useRenderableMediaUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    platform.hasServiceWorker.mockReset();
    mediaTransport.fetchMediaBlob.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rendered-media');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the original url when a service worker runtime is available', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('https://example.org/media.png'));

    expect(result.current).toBe('https://example.org/media.png');
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
  });

  it('rejects non-browser-safe media urls in service worker runtimes', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
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
    const { useRenderableMediaUrl } = await import('./useRenderableMediaUrl');

    const { result } = renderHook(() => useRenderableMediaUrl('data:text/html,boom'));

    expect(result.current).toBeUndefined();
    expect(mediaTransport.fetchMediaBlob).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object url when the last consumer unmounts', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
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
