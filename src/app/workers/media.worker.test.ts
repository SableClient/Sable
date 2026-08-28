import { afterEach, describe, expect, it, vi } from 'vitest';

type Post = { id: number; hash?: string; error?: string };

// OffscreenCanvas coerces dimensions to unsigned integers, like the real platform.
class StubOffscreenCanvas {
  width: number;

  height: number;

  constructor(width: number, height: number) {
    this.width = width >>> 0;
    this.height = height >>> 0;
  }

  getContext() {
    const { width, height } = this;
    return {
      drawImage: () => undefined,
      getImageData: () => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    };
  }
}

const setupWorker = async () => {
  vi.resetModules();
  const posts: Post[] = [];
  let messageHandler: ((event: { data: unknown }) => void) | undefined;
  vi.stubGlobal('OffscreenCanvas', StubOffscreenCanvas);
  vi.stubGlobal('self', {
    addEventListener: (type: string, handler: (event: { data: unknown }) => void) => {
      if (type === 'message') messageHandler = handler;
    },
    postMessage: (message: Post) => posts.push(message),
  });
  await import('./media.worker');
  if (!messageHandler) throw new Error('worker did not register a message handler');
  return { posts, messageHandler };
};

describe('media.worker blurhash', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes blurhash when requested dimensions are floats', async () => {
    const { posts, messageHandler } = await setupWorker();
    const bitmap = { close: vi.fn<() => void>() };

    expect(() =>
      messageHandler({
        data: { id: 1, type: 'blurhash', bitmap, width: 512, height: 170.496 },
      })
    ).not.toThrow();

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.error).toBeUndefined();
    expect(typeof posts[0]?.hash).toBe('string');
  });
});
