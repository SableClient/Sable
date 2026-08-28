import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { useCrossSigningResetDetect } from './useCrossSigningResetDetect';

const { useAccountDataCallback } = vi.hoisted(() => ({
  useAccountDataCallback:
    vi.fn<(mx: MatrixClient | undefined, callback: (event: MatrixEvent) => void) => void>(),
}));

vi.mock('./useAccountDataCallback', () => ({ useAccountDataCallback }));

const ownUserId = '@me:example.org';
const crossSigningEvent = { getType: () => 'm.cross_signing.master' } as MatrixEvent;

const getAccountDataCallback = () => {
  const callback = useAccountDataCallback.mock.calls[0]?.[1];
  if (!callback) throw new Error('Expected an account data callback');
  return callback;
};

describe('useCrossSigningResetDetect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAccountDataCallback.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers and coalesces cross-signing device list refreshes', async () => {
    const processDeviceLists = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const mx = {
      getCrypto: () => ({ processDeviceLists }),
      getSafeUserId: () => ownUserId,
    } as unknown as MatrixClient;

    renderHook(() => useCrossSigningResetDetect(mx));
    const onAccountData = getAccountDataCallback();

    onAccountData(crossSigningEvent);
    onAccountData(crossSigningEvent);
    expect(processDeviceLists).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(processDeviceLists).toHaveBeenCalledOnce();
    expect(processDeviceLists).toHaveBeenCalledWith({ changed: [ownUserId] });
  });

  it('cancels a queued refresh when the client is replaced', () => {
    const processDeviceLists = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const mx = {
      getCrypto: () => ({ processDeviceLists }),
      getSafeUserId: () => ownUserId,
    } as unknown as MatrixClient;
    const props: { client: MatrixClient | undefined } = { client: mx };

    const { rerender } = renderHook(
      ({ client }: { client: MatrixClient | undefined }) => useCrossSigningResetDetect(client),
      {
        initialProps: props,
      }
    );
    const onAccountData = getAccountDataCallback();
    onAccountData(crossSigningEvent);

    rerender({ client: undefined });
    act(() => vi.runAllTimers());

    expect(processDeviceLists).not.toHaveBeenCalled();
  });
});
