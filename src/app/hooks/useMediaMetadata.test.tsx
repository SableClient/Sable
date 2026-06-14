/* oxlint-disable vitest/require-mock-type-parameters */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedMediaMetadata } from '$utils/mediaMetadata';

const mediaMetadata = vi.hoisted(() => {
  let snapshot: CachedMediaMetadata | undefined;
  let listener: ((metadata: CachedMediaMetadata | undefined) => void) | undefined;

  return {
    clear: () => {
      snapshot = undefined;
      listener = undefined;
    },
    emit: (metadata: CachedMediaMetadata | undefined) => {
      snapshot = metadata;
      listener?.(metadata);
    },
    getMediaMetadata: vi.fn<() => Promise<CachedMediaMetadata | undefined>>(),
    getMediaMetadataSnapshot: vi.fn(() => snapshot),
    subscribeMediaMetadata: vi.fn(
      (_cacheKey: string | undefined, nextListener: typeof listener) => {
        listener = nextListener;
        return () => {
          if (listener === nextListener) listener = undefined;
        };
      }
    ),
  };
});

vi.mock('$utils/mediaMetadata', () => mediaMetadata);

describe('useMediaMetadata', () => {
  beforeEach(() => {
    vi.resetModules();
    mediaMetadata.clear();
    mediaMetadata.getMediaMetadata.mockReset();
    mediaMetadata.getMediaMetadataSnapshot.mockClear();
    mediaMetadata.subscribeMediaMetadata.mockClear();
  });

  it('does not overwrite subscribed metadata with a stale async read', async () => {
    let resolveRead!: (metadata: CachedMediaMetadata | undefined) => void;
    mediaMetadata.getMediaMetadata.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );
    const { useMediaMetadata } = await import('./useMediaMetadata');
    const { result } = renderHook(() => useMediaMetadata('session:https://example.org/image.png'));

    const freshMetadata = {
      cachedAt: Date.now(),
      height: 60,
      kind: 'image' as const,
      width: 120,
    };
    act(() => {
      mediaMetadata.emit(freshMetadata);
    });

    await waitFor(() => {
      expect(result.current).toBe(freshMetadata);
    });

    await act(async () => {
      resolveRead(undefined);
    });

    expect(result.current).toBe(freshMetadata);
  });

  it('does not return stale metadata when the cache key changes', async () => {
    const firstMetadata = {
      cachedAt: Date.now(),
      height: 60,
      kind: 'image' as const,
      width: 120,
    };
    mediaMetadata.emit(firstMetadata);
    mediaMetadata.getMediaMetadata.mockResolvedValue(undefined);
    const { useMediaMetadata } = await import('./useMediaMetadata');

    const { rerender, result } = renderHook(({ cacheKey }) => useMediaMetadata(cacheKey), {
      initialProps: { cacheKey: 'session:https://example.org/first.png' },
    });

    expect(result.current).toBe(firstMetadata);

    mediaMetadata.clear();
    rerender({ cacheKey: 'session:https://example.org/second.png' });

    expect(result.current).toBeUndefined();
  });
});
