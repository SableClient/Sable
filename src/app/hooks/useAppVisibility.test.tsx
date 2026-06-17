import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { appEvents } from '../utils/appEvents';
import { useAppVisibility } from './useAppVisibility';

const mocks = vi.hoisted(() => ({
  togglePusher: vi.fn<() => Promise<void>>(),
}));

vi.mock('$utils/user-agent', () => ({
  mobileOrTablet: () => false,
}));

vi.mock('../features/settings/notifications/PushNotifications', () => ({
  togglePusher: mocks.togglePusher,
}));

vi.mock('./useClientConfig', () => ({
  useClientConfig: () => ({}),
}));

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

describe('useAppVisibility', () => {
  beforeEach(() => {
    setVisibilityState('visible');
    mocks.togglePusher.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits visibility events through appEvents', () => {
    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);
    const mx = {} as MatrixClient;

    renderHook(() => useAppVisibility(mx));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(visibilityHandler).toHaveBeenNthCalledWith(1, false);
    expect(visibilityHandler).toHaveBeenNthCalledWith(2, true);

    unsubscribe();
  });

  it('toggles the pusher when visibility changes', () => {
    const mx = {} as MatrixClient;

    renderHook(() => useAppVisibility(mx));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mocks.togglePusher).toHaveBeenNthCalledWith(
      1,
      mx,
      {},
      false,
      false,
      expect.any(Array),
      false
    );
    expect(mocks.togglePusher).toHaveBeenNthCalledWith(
      2,
      mx,
      {},
      true,
      false,
      expect.any(Array),
      false
    );
  });
});
