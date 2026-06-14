/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('mediaMetadata', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        close: vi.fn(),
        height: 60,
        width: 120,
      }))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores measured image dimensions in memory', async () => {
    const { getMediaMetadata, getMediaMetadataSnapshot, storeMediaMetadataForBlob } =
      await import('./mediaMetadata');

    await storeMediaMetadataForBlob(
      'session:https://example.org/image.png',
      new Blob(['image'], {
        type: 'image/png',
      })
    );

    expect(getMediaMetadataSnapshot('session:https://example.org/image.png')).toMatchObject({
      byteSize: 5,
      height: 60,
      kind: 'image',
      mimeType: 'image/png',
      width: 120,
    });
    await expect(getMediaMetadata('session:https://example.org/image.png')).resolves.toMatchObject({
      height: 60,
      width: 120,
    });
  });

  it('notifies subscribers when metadata changes and clears', async () => {
    const { clearMediaMetadataCache, storeMediaMetadataForBlob, subscribeMediaMetadata } =
      await import('./mediaMetadata');
    const listener = vi.fn();

    const unsubscribe = subscribeMediaMetadata('session:https://example.org/image.png', listener);
    await storeMediaMetadataForBlob(
      'session:https://example.org/image.png',
      new Blob(['image'], {
        type: 'image/png',
      })
    );

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ height: 60, width: 120 }));

    await clearMediaMetadataCache();
    expect(listener).toHaveBeenCalledWith(undefined);

    unsubscribe();
  });

  it('times out stalled video metadata reads and revokes the object url', async () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-metadata');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const video = {
      addEventListener: vi.fn(),
      load: vi.fn(),
      preload: '',
      removeAttribute: vi.fn(),
      removeEventListener: vi.fn(),
      set src(_value: string) {},
    };
    vi.spyOn(document, 'createElement').mockReturnValue(video as unknown as HTMLVideoElement);

    const { getMediaMetadataSnapshot, storeMediaMetadataForBlob } = await import('./mediaMetadata');

    const metadataPromise = storeMediaMetadataForBlob(
      'session:https://example.org/video.mp4',
      new Blob(['video'], { type: 'video/mp4' }),
      'video'
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(metadataPromise).resolves.toMatchObject({
      byteSize: 5,
      kind: 'video',
      mimeType: 'video/mp4',
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-metadata');
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
    expect(getMediaMetadataSnapshot('session:https://example.org/video.mp4')).toMatchObject({
      byteSize: 5,
      kind: 'video',
    });
  });
});
