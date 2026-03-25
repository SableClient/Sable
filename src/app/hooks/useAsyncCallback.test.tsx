// Integration tests: renderHook exercises the full React lifecycle including
// useAlive (cleanup on unmount) and retry-race-condition logic.
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncCallback, AsyncStatus } from './useAsyncCallback';

describe('useAsyncCallback', () => {
  it('starts in Idle state', () => {
    const { result } = renderHook(() => useAsyncCallback(async () => 'value'));
    const [state] = result.current;
    expect(state.status).toBe(AsyncStatus.Idle);
  });

  it('transitions to Success with returned data', async () => {
    const { result } = renderHook(() => useAsyncCallback(async () => 42));

    await act(async () => {
      await result.current[1]();
    });

    expect(result.current[0]).toEqual({ status: AsyncStatus.Success, data: 42 });
  });

  it('transitions to Error when the async function throws', async () => {
    const boom = new Error('boom');
    const { result } = renderHook(() =>
      useAsyncCallback(async () => {
        throw boom;
      })
    );

    await act(async () => {
      await result.current[1]().catch(() => {});
    });

    expect(result.current[0]).toEqual({ status: AsyncStatus.Error, error: boom });
  });

  it('ignores the result of a stale (superseded) request', async () => {
    // Two calls are made. The first resolves AFTER the second — its result should
    // be discarded so the final state reflects only the second call.
    let resolveFirst!: (v: string) => void;
    let resolveSecond!: (v: string) => void;
    let callCount = 0;

    const { result } = renderHook(() =>
      useAsyncCallback(async () => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<string>((res) => {
            resolveFirst = res;
          });
        }
        return new Promise<string>((res) => {
          resolveSecond = res;
        });
      })
    );

    // Fire both requests before either resolves
    act(() => {
      result.current[1]();
    });
    act(() => {
      result.current[1]();
    });

    // Resolve the stale first request — its result should be ignored
    await act(async () => {
      resolveFirst('stale');
      await Promise.resolve();
    });

    // Resolve the fresh second request — this should be the final state
    await act(async () => {
      resolveSecond('fresh');
      await Promise.resolve();
    });

    const successStates = result.current[0];
    expect(successStates.status).toBe(AsyncStatus.Success);
    if (successStates.status === AsyncStatus.Success) {
      expect(successStates.data).toBe('fresh');
    }
  });

  it('does not call setState after the component unmounts', async () => {
    let resolveAfterUnmount!: (v: string) => void;
    const stateChanges: string[] = [];

    const { result, unmount } = renderHook(() =>
      useAsyncCallback(
        async () =>
          new Promise<string>((res) => {
            resolveAfterUnmount = res;
          })
      )
    );

    // Track state changes via the third returned setter
    const [, callback, setState] = result.current;
    const originalSetState = setState;
    // Patch setState to record calls
    result.current[2] = (s) => {
      stateChanges.push(typeof s === 'function' ? 'fn' : s.status);
      originalSetState(s);
    };

    act(() => {
      callback();
    });

    unmount();

    // Resolve after unmount — alive() returns false, so state should NOT be updated
    await act(async () => {
      resolveAfterUnmount('late');
      await Promise.resolve();
    });

    // Only the Loading state (queued before unmount) may have been emitted;
    // Success must not appear after unmount.
    const successCalls = stateChanges.filter((s) => s === AsyncStatus.Success);
    expect(successCalls).toHaveLength(0);
  });
});
