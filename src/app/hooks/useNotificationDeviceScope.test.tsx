/* oxlint-disable vitest/require-mock-type-parameters */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import {
  shouldEnableNotificationPusher,
  useNotificationDeviceScope,
} from './useNotificationDeviceScope';

let notificationDeviceScope: 'all_clients' | 'active_client_only' = 'all_clients';

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [notificationDeviceScope, vi.fn()],
}));

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

type LeaseContent = {
  deviceId: string;
  updatedAt: number;
  expiresAt: number;
};

function createMockMatrixClient(initialLease?: LeaseContent) {
  let lease = initialLease;
  let accountDataHandler: ((event: { getType: () => string }) => void) | undefined;

  const client = {
    getDeviceId: vi.fn(() => 'DEVICE_A'),
    getAccountData: vi.fn((type: string) => {
      if (type !== CustomAccountDataEvent.SableNotificationDeviceLease || lease === undefined) {
        return undefined;
      }

      return {
        getContent: () => lease,
      };
    }),
    setAccountData: vi.fn(async (_type: string, content: LeaseContent) => {
      lease = content;
    }),
    on: vi.fn((_event: string, handler: typeof accountDataHandler) => {
      accountDataHandler = handler;
    }),
    removeListener: vi.fn(),
  } as unknown as MatrixClient;

  return {
    client,
    setLease: (nextLease: LeaseContent | undefined) => {
      lease = nextLease;
    },
    emitAccountData: () => {
      accountDataHandler?.({
        getType: () => CustomAccountDataEvent.SableNotificationDeviceLease,
      });
    },
  };
}

describe('useNotificationDeviceScope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
    notificationDeviceScope = 'all_clients';
    setVisibilityState('visible');
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats all-clients mode as always active without keeping web push enabled', () => {
    const { client } = createMockMatrixClient();

    const { result } = renderHook(() => useNotificationDeviceScope(client));

    expect(result.current.notificationDeviceScope).toBe('all_clients');
    expect(result.current.isActiveNotificationClient).toBe(true);
    expect(result.current.shouldKeepWebPushEnabled).toBe(false);
    expect(result.current.activeReason).toBe('all_clients');
    expect(result.current.isVisible).toBe(true);
    expect(result.current.isWindowFocused).toBe(true);
  });

  it('publishes an active lease for the focused visible client in active-client-only mode', async () => {
    notificationDeviceScope = 'active_client_only';
    const { client } = createMockMatrixClient();

    const { result } = renderHook(() => useNotificationDeviceScope(client));

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.setAccountData).toHaveBeenCalledTimes(1);
    expect(result.current.isThisClientLeaseHolder).toBe(true);
    expect(result.current.isActiveNotificationClient).toBe(true);
    expect(result.current.shouldKeepWebPushEnabled).toBe(true);
    expect(result.current.activeReason).toBe('lease_holder');
    expect(result.current.leaseFresh).toBe(true);
  });

  it('treats a fresh lease held by another client as inactive when this tab is not focused', () => {
    notificationDeviceScope = 'active_client_only';
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });

    const now = Date.now();
    const { client } = createMockMatrixClient({
      deviceId: 'DEVICE_B',
      updatedAt: now,
      expiresAt: now + 60_000,
    });

    const { result } = renderHook(() => useNotificationDeviceScope(client));

    expect(result.current.isActiveNotificationClient).toBe(false);
    expect(result.current.isThisClientLeaseHolder).toBe(false);
    expect(result.current.shouldKeepWebPushEnabled).toBe(false);
    expect(result.current.activeReason).toBe('lease_held_elsewhere');
    expect(client.setAccountData).not.toHaveBeenCalled();
  });

  it('falls back to active when another client lease expires', () => {
    notificationDeviceScope = 'active_client_only';
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });

    const now = Date.now();
    const { client } = createMockMatrixClient({
      deviceId: 'DEVICE_B',
      updatedAt: now - 120_000,
      expiresAt: now - 1,
    });

    const { result } = renderHook(() => useNotificationDeviceScope(client));

    expect(result.current.isActiveNotificationClient).toBe(true);
    expect(result.current.shouldKeepWebPushEnabled).toBe(true);
    expect(result.current.activeReason).toBe('no_fresh_lease');
  });

  it('updates the in-memory lease when account data changes arrive', async () => {
    notificationDeviceScope = 'active_client_only';
    const { client, setLease, emitAccountData } = createMockMatrixClient();

    const { result } = renderHook(() => useNotificationDeviceScope(client));

    const nextLease = {
      deviceId: 'DEVICE_B',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 120_000,
    };

    act(() => {
      setLease(nextLease);
      emitAccountData();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.lease).toEqual(nextLease);
  });

  it('can read lease state without publishing duplicate leases', async () => {
    notificationDeviceScope = 'active_client_only';
    const { client } = createMockMatrixClient();

    const { result } = renderHook(() =>
      useNotificationDeviceScope(client, {
        publishLease: false,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.setAccountData).not.toHaveBeenCalled();
    expect(result.current.isActiveNotificationClient).toBe(true);
    expect(result.current.shouldKeepWebPushEnabled).toBe(true);
  });

  it('shares optimistic lease updates with read-only consumers in the same tab', async () => {
    notificationDeviceScope = 'active_client_only';
    const { client } = createMockMatrixClient();

    const owner = renderHook(() => useNotificationDeviceScope(client));
    const observer = renderHook(() =>
      useNotificationDeviceScope(client, {
        publishLease: false,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.setAccountData).toHaveBeenCalledTimes(1);
    expect(observer.result.current.isThisClientLeaseHolder).toBe(true);
    expect(observer.result.current.isActiveNotificationClient).toBe(true);

    owner.unmount();
    observer.unmount();
  });

  it('keeps desktop push enabled for all-clients scope while visible', () => {
    expect(shouldEnableNotificationPusher(true, false, 'all_clients', true)).toBe(true);
  });
});
