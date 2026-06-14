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
    vi.unstubAllGlobals();
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
});
