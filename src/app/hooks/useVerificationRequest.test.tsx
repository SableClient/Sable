import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VerifierEvent } from '$types/matrix-sdk';
import { useVerifierShowSas } from './useVerificationRequest';

describe('useVerifierShowSas', () => {
  it('publishes SAS callbacks that were ready before the listener subscribed', () => {
    const sasCallbacks = { sas: { emoji: [] } };
    const on = vi.fn<(event: string, handler: () => void) => void>();
    const removeListener = vi.fn<(event: string, handler: () => void) => void>();
    const getShowSasCallbacks = vi.fn<() => typeof sasCallbacks | null>(() => sasCallbacks);
    const onCallback = vi.fn<(callbacks: unknown) => void>();

    const { unmount } = renderHook(() =>
      useVerifierShowSas(
        {
          on,
          removeListener,
          getShowSasCallbacks,
        } as never,
        onCallback as never
      )
    );

    expect(on).toHaveBeenCalledWith(VerifierEvent.ShowSas, onCallback);
    expect(getShowSasCallbacks).toHaveBeenCalledOnce();
    expect(onCallback).toHaveBeenCalledWith(sasCallbacks);
    expect(on.mock.invocationCallOrder[0]).toBeLessThan(
      getShowSasCallbacks.mock.invocationCallOrder[0] ?? 0
    );

    unmount();
    expect(removeListener).toHaveBeenCalledWith(VerifierEvent.ShowSas, onCallback);
  });
});
