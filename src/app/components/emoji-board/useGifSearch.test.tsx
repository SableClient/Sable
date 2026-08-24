import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGifSearch } from './useGifSearch';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock('$utils/fetch', () => ({ fetch: fetchMock }));
vi.mock('$hooks/useClientConfig', () => ({
  useClientConfig: () => ({ gifs: { provider: 'klipy', klipyApiKey: 'test-key' } }),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const responseFor = (id: string): Response =>
  new Response(
    JSON.stringify({
      data: {
        data: [
          {
            id,
            title: id,
            slug: `test-${id}`,
            file: { xs: { gif: { url: `https://${id}.preview` } } },
          },
        ],
      },
    }),
    { status: 200 }
  );

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  fetchMock.mockReset();
});

describe('useGifSearch', () => {
  it('keeps stale success, error, and finally handlers from changing the latest request', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    fetchMock.mockImplementation((url: string) =>
      url.includes('q=first') ? first.promise : second.promise
    );

    const { result } = renderHook(() => useGifSearch([], true, vi.fn<() => void>()));

    act(() => {
      void result.current.searchGifs('first');
      void result.current.searchGifs('second');
    });

    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);

    first.reject(new Error('stale failure'));
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    second.resolve(responseFor('second'));
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.gifs.gifs[0]?.id).toBe('second');
    expect(result.current.gifs.gifs[0]?.shareUrl).toBe('https://klipy.com/gifs/test-second');
    expect(result.current.loading).toBe(false);

    first.resolve(responseFor('first'));
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.gifs.gifs[0]?.id).toBe('second');
  });

  it('aborts and invalidates a request when cancelled or closed', async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValue(request.promise);

    const { result, rerender } = renderHook(
      ({ open }) => useGifSearch([], open, vi.fn<() => void>()),
      { initialProps: { open: true } }
    );

    act(() => {
      void result.current.searchGifs('query');
    });
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;

    rerender({ open: false });

    expect(signal.aborted).toBe(true);
    expect(result.current.loading).toBe(false);

    request.resolve(responseFor('stale'));
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.gifs.gifs).toEqual([]);
  });

  it('aborts the active request on unmount', () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValue(request.promise);
    const { result, unmount } = renderHook(() => useGifSearch([], true, vi.fn<() => void>()));

    act(() => {
      void result.current.searchGifs('query');
    });
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
