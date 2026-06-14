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

  it('merges later metadata without dropping existing dimensions', async () => {
    const { getMediaMetadataSnapshot, storeMediaMetadataForBlob } = await import('./mediaMetadata');
    const cacheKey = 'session:https://example.org/image.png';

    await storeMediaMetadataForBlob(cacheKey, new Blob(['image'], { type: 'image/png' }), 'image');
    await storeMediaMetadataForBlob(
      cacheKey,
      new Blob(['generic'], { type: 'application/octet-stream' })
    );

    expect(getMediaMetadataSnapshot(cacheKey)).toMatchObject({
      byteSize: 7,
      height: 60,
      kind: 'image',
      width: 120,
    });
  });

  it('can store measured dimensions without aliasing thumbnail byte size', async () => {
    const { getMediaMetadataSnapshot, storeMediaMetadataForBlob } = await import('./mediaMetadata');
    const cacheKey = 'session:https://example.org/preview.png';

    await storeMediaMetadataForBlob(cacheKey, new Blob(['thumb'], { type: 'image/png' }), 'image', {
      includeByteSize: false,
    });

    expect(getMediaMetadataSnapshot(cacheKey)).toMatchObject({
      height: 60,
      kind: 'image',
      width: 120,
    });
    expect(getMediaMetadataSnapshot(cacheKey)?.byteSize).toBeUndefined();
  });

  it('persists scoped metadata keys as valid cache requests', async () => {
    const cache = {
      delete: vi.fn(async () => true),
      keys: vi.fn(async () => []),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal('caches', {
      open: vi.fn(async () => cache),
    });
    const { storeMediaMetadataForBlob } = await import('./mediaMetadata');
    const scopedKey = '@alice:example.org:https://example.org/image.png';

    await storeMediaMetadataForBlob(scopedKey, new Blob(['image'], { type: 'image/png' }));

    expect(cache.put).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledWith(expect.any(Request), expect.any(Response));
    const request = (cache.put.mock.calls[0] as unknown[])[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).url).toBe(
      `https://sable.local/media-metadata/${encodeURIComponent(scopedKey)}`
    );
  });

  it('reads persisted metadata through encoded cache requests', async () => {
    const cachedMetadata = {
      cachedAt: 123,
      height: 60,
      kind: 'image',
      mimeType: 'image/png',
      width: 120,
    };
    const cache = {
      match: vi.fn(async () => new Response(JSON.stringify(cachedMetadata))),
    };
    vi.stubGlobal('caches', {
      open: vi.fn(async () => cache),
    });
    const { getMediaMetadata } = await import('./mediaMetadata');
    const scopedKey = '@alice:example.org:https://example.org/image.png';

    await expect(getMediaMetadata(scopedKey)).resolves.toMatchObject(cachedMetadata);

    expect(cache.match).toHaveBeenCalledOnce();
    expect(cache.match).toHaveBeenCalledWith(expect.any(Request));
    const request = (cache.match.mock.calls[0] as unknown[])[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).url).toBe(
      `https://sable.local/media-metadata/${encodeURIComponent(scopedKey)}`
    );
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
