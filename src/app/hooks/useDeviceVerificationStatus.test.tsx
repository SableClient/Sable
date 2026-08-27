import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { CryptoEvent, type CryptoApi } from '$types/matrix-sdk';

import {
  useDeviceVerificationStatus,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from './useDeviceVerificationStatus';

const { mockMx, getListenerCount, sentry } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  const mx = {
    on(event: string, cb: (...args: never[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(cb);
      listeners.set(event, set);
      return mx;
    },
    removeListener(event: string, cb: (...args: never[]) => void) {
      listeners.get(event)?.delete(cb);
      return mx;
    },
    emit(event: string, ...args: never[]) {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
    getListenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
    getSafeUserId() {
      return '@me:example.org';
    },
  };
  return {
    mockMx: mx,
    getListenerCount: (event: string) => mx.getListenerCount(event),
    sentry: { addBreadcrumb: vi.fn<() => void>(), metrics: { count: vi.fn<() => void>() } },
  };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

vi.mock('@sentry/react', () => sentry);

const USER_ID = '@me:example.org';
const DEVICE_ID = 'DEVICEONE';

const deviceVerificationStatus = (status: {
  crossSigningVerified: boolean;
  localVerified: boolean;
  signedByOwner?: boolean;
}) => ({ signedByOwner: false, ...status });

const getDeviceVerificationStatus = vi.fn<
  (
    userId: string,
    deviceId: string
  ) => Promise<{
    crossSigningVerified: boolean;
    localVerified: boolean;
    signedByOwner: boolean;
  } | null>
>();
const crypto = { getDeviceVerificationStatus } as unknown as CryptoApi;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useDeviceVerificationStatus', () => {
  beforeEach(() => {
    getDeviceVerificationStatus.mockReset();
    getDeviceVerificationStatus.mockResolvedValue(
      deviceVerificationStatus({ crossSigningVerified: true, localVerified: false })
    );
    sentry.addBreadcrumb.mockClear();
    sentry.metrics.count.mockClear();
  });

  it('reports the cross-signing verification status', async () => {
    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(VerificationStatus.Unknown);
    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
  });

  it('reports a locally verified device as verified', async () => {
    getDeviceVerificationStatus.mockResolvedValue(
      deviceVerificationStatus({ crossSigningVerified: false, localVerified: true })
    );

    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
  });

  it('reports an owner-signed device as verified', async () => {
    getDeviceVerificationStatus.mockResolvedValue(
      deviceVerificationStatus({
        crossSigningVerified: false,
        localVerified: false,
        signedByOwner: true,
      })
    );

    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
  });

  it('reports Unsupported when the device has no verification status', async () => {
    getDeviceVerificationStatus.mockResolvedValue(null);

    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Unsupported));
  });

  it('stays Unknown without a device id and never verifies', async () => {
    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, undefined), {
      wrapper: createWrapper(),
    });

    await act(async () => {});

    expect(result.current).toBe(VerificationStatus.Unknown);
    expect(getDeviceVerificationStatus).not.toHaveBeenCalled();
  });

  it('stays Unknown without a crypto api and never verifies', async () => {
    const { result } = renderHook(
      () => useDeviceVerificationStatus(undefined, USER_ID, DEVICE_ID),
      { wrapper: createWrapper() }
    );

    await act(async () => {});

    expect(result.current).toBe(VerificationStatus.Unknown);
    expect(getDeviceVerificationStatus).not.toHaveBeenCalled();
  });

  it('verifies a device once when several consumers observe it', async () => {
    const { result } = renderHook(
      () =>
        [
          useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID),
          useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID),
          useUnverifiedDeviceCount(crypto, USER_ID, [DEVICE_ID]),
        ] as const,
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current[0]).toBe(VerificationStatus.Verified));
    await waitFor(() => expect(result.current[2]).toBe(0));

    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(1);
  });

  it('does not re-verify while no crypto event arrives', async () => {
    const { result, rerender } = renderHook(
      () => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
    rerender();
    rerender();

    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(1);
  });

  it('re-verifies when a consumer remounts after the previous one unmounted', async () => {
    const wrapper = createWrapper();
    const first = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper,
    });

    await waitFor(() => expect(first.result.current).toBe(VerificationStatus.Verified));
    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper,
    });

    await waitFor(() => expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(2));
    second.unmount();
  });

  it.each([
    ['DevicesUpdated for the user', CryptoEvent.DevicesUpdated, [[USER_ID], false]],
    ['KeysChanged', CryptoEvent.KeysChanged, [{}]],
    ['UserTrustStatusChanged for the user', CryptoEvent.UserTrustStatusChanged, [USER_ID, {}]],
  ])('re-verifies on %s', async (_label, event, args) => {
    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(1);

    getDeviceVerificationStatus.mockResolvedValue(
      deviceVerificationStatus({ crossSigningVerified: false, localVerified: false })
    );
    await act(async () => {
      mockMx.emit(event, ...(args as never[]));
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Unverified));
    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(2);
  });

  it('records a current-device trust loss after a crypto refresh', async () => {
    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
    getDeviceVerificationStatus.mockResolvedValue(
      deviceVerificationStatus({ crossSigningVerified: false, localVerified: false })
    );

    await act(async () => {
      mockMx.emit(CryptoEvent.KeysChanged, ...([{}] as never[]));
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Unverified));
    expect(sentry.metrics.count).toHaveBeenCalledWith('sable.crypto.device_verification_lost', 1, {
      attributes: { own_device: true },
    });
  });

  it('ignores device updates for a different user', async () => {
    const { result } = renderHook(() => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));

    await act(async () => {
      mockMx.emit(CryptoEvent.DevicesUpdated, ...(['@other:example.org'] as never[]));
      mockMx.emit(CryptoEvent.UserTrustStatusChanged, ...(['@other:example.org', {}] as never[]));
    });

    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(1);
  });

  it('triggers a new verification call when the crypto instance changes for the same user/device', async () => {
    const wrapper = createWrapper();
    const getDeviceVerificationStatus2 = vi
      .fn<
        (
          userId: string,
          deviceId: string
        ) => Promise<{
          crossSigningVerified: boolean;
          localVerified: boolean;
          signedByOwner: boolean;
        } | null>
      >()
      .mockResolvedValue(
        deviceVerificationStatus({ crossSigningVerified: true, localVerified: false })
      );
    const crypto2 = {
      getDeviceVerificationStatus: getDeviceVerificationStatus2,
    } as unknown as CryptoApi;

    const { result, rerender } = renderHook(
      ({ c }) => useDeviceVerificationStatus(c, USER_ID, DEVICE_ID),
      {
        wrapper,
        initialProps: { c: crypto },
      }
    );

    await waitFor(() => expect(result.current).toBe(VerificationStatus.Verified));
    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(1);

    rerender({ c: crypto2 });

    await waitFor(() => expect(getDeviceVerificationStatus2).toHaveBeenCalledTimes(1));
    expect(getDeviceVerificationStatus2).toHaveBeenCalledWith(USER_ID, DEVICE_ID);
  });

  it('does not trigger duplicate invalidations for unaffected users when UserTrustStatusChanged fires', async () => {
    const USER_B = '@userB:example.org';
    const wrapper = createWrapper();

    const { result: resultA } = renderHook(
      () => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID),
      { wrapper }
    );
    const { result: resultB } = renderHook(
      () => useDeviceVerificationStatus(crypto, USER_B, DEVICE_ID),
      { wrapper }
    );

    await waitFor(() => expect(resultA.current).toBe(VerificationStatus.Verified));
    await waitFor(() => expect(resultB.current).toBe(VerificationStatus.Verified));
    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(2);

    getDeviceVerificationStatus.mockResolvedValue(
      deviceVerificationStatus({ crossSigningVerified: false, localVerified: false })
    );

    await act(async () => {
      mockMx.emit(CryptoEvent.UserTrustStatusChanged, ...([USER_B, {}] as never[]));
    });

    await waitFor(() => expect(resultB.current).toBe(VerificationStatus.Unverified));
    expect(getDeviceVerificationStatus).toHaveBeenCalledTimes(3);
  });

  it('shares event subscriptions across multiple consumers and cleans up when all unmount', async () => {
    const wrapper = createWrapper();
    const { unmount: unmount1 } = renderHook(
      () => useDeviceVerificationStatus(crypto, USER_ID, DEVICE_ID),
      { wrapper }
    );
    const { unmount: unmount2 } = renderHook(
      () => useDeviceVerificationStatus(crypto, '@user2:example.org', DEVICE_ID),
      { wrapper }
    );

    expect(getListenerCount(CryptoEvent.DevicesUpdated)).toBe(1);
    expect(getListenerCount(CryptoEvent.KeysChanged)).toBe(1);
    expect(getListenerCount(CryptoEvent.UserTrustStatusChanged)).toBe(1);

    unmount1();
    expect(getListenerCount(CryptoEvent.DevicesUpdated)).toBe(1);

    unmount2();
    expect(getListenerCount(CryptoEvent.DevicesUpdated)).toBe(0);
    expect(getListenerCount(CryptoEvent.KeysChanged)).toBe(0);
    expect(getListenerCount(CryptoEvent.UserTrustStatusChanged)).toBe(0);
  });
});

describe('useUnverifiedDeviceCount', () => {
  beforeEach(() => {
    getDeviceVerificationStatus.mockReset();
  });

  it('counts only devices that are not cross-signing verified', async () => {
    getDeviceVerificationStatus.mockImplementation((_userId: string, deviceId: string) =>
      Promise.resolve(
        deviceVerificationStatus({
          crossSigningVerified: deviceId === 'VERIFIED',
          localVerified: false,
        })
      )
    );

    const { result } = renderHook(
      () => useUnverifiedDeviceCount(crypto, USER_ID, ['VERIFIED', 'UNVERIFIED1', 'UNVERIFIED2']),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current).toBe(2));
  });

  it('returns 0 without a crypto api', () => {
    const { result } = renderHook(() => useUnverifiedDeviceCount(undefined, USER_ID, [DEVICE_ID]), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(0);
    expect(getDeviceVerificationStatus).not.toHaveBeenCalled();
  });
});
