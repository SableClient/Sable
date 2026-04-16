import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaTransport = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
}));

vi.mock('./mediaTransport', () => mediaTransport);

describe('loadImageElementFromMediaUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    mediaTransport.fetchMediaBlob.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:loaded-image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'img') {
        let currentSrc = '';
        let onload: ((event: Event) => void) | null = null;
        let onerror: ((event: Event | string) => void) | null = null;

        return {
          set onload(handler: ((event: Event) => void) | null) {
            onload = handler;
          },
          get onload() {
            return onload;
          },
          set onerror(handler: ((event: Event | string) => void) | null) {
            onerror = handler;
          },
          get onerror() {
            return onerror;
          },
          set src(value: string) {
            currentSrc = value;
            queueMicrotask(() => onload?.(new Event('load')));
          },
          get src() {
            return currentSrc;
          },
        } as unknown as HTMLImageElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads images from transport-fetched blobs instead of direct remote urls', async () => {
    const stickerBlob = new Blob(['sticker'], { type: 'image/png' });
    mediaTransport.fetchMediaBlob.mockResolvedValue(stickerBlob);

    const dom = (await import('./dom')) as typeof import('./dom') & {
      loadImageElementFromMediaUrl: (url: string) => Promise<{
        blob: Blob;
        image: HTMLImageElement;
      }>;
    };
    const result = await dom.loadImageElementFromMediaUrl('https://example.org/sticker.png');

    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledWith(
      'https://example.org/sticker.png',
      undefined
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(stickerBlob);
    expect(result.blob).toBe(stickerBlob);
    expect(result.image.src).toBe('blob:loaded-image');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:loaded-image');
  });
});
