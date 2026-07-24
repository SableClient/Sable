import { describe, expect, it, vi } from 'vitest';

vi.mock('$types/matrix-sdk', () => ({
  SyncState: {
    Prepared: 'Prepared',
    Syncing: 'Syncing',
    Catchup: 'Catchup',
    Reconnecting: 'Reconnecting',
    Error: 'Error',
  },
}));

vi.mock('$hooks/useSlidingSyncHydrating', () => ({
  useSlidingSyncHydrating: () => ({ isHydrating: false, progress: null }),
}));

vi.mock('$hooks/useSyncState', () => ({
  useSyncState: () => undefined,
}));

vi.mock('$state/hooks/desktopSettings', () => ({
  useDesktopSetting: () => [false, vi.fn<() => void>()] as const,
}));

import { SyncState } from '$types/matrix-sdk';
import { shouldShowConnecting, shouldShowInlineSyncStatus } from './SyncStatus';

describe('shouldShowConnecting', () => {
  it('hides ordinary initial connection states', () => {
    expect(shouldShowConnecting(false, SyncState.Prepared, null)).toBe(false);
    expect(shouldShowConnecting(false, SyncState.Syncing, SyncState.Prepared)).toBe(false);
    expect(shouldShowConnecting(false, SyncState.Catchup, null)).toBe(false);
  });

  it('shows recovery progress after a client has previously connected', () => {
    expect(shouldShowConnecting(true, SyncState.Catchup, SyncState.Reconnecting)).toBe(true);
    expect(shouldShowConnecting(true, SyncState.Syncing, SyncState.Catchup)).toBe(true);
  });

  it('hides the banner during steady syncing', () => {
    expect(shouldShowConnecting(true, SyncState.Syncing, SyncState.Syncing)).toBe(false);
  });
});

describe('shouldShowInlineSyncStatus', () => {
  it('keeps the inline banner for native chrome', () => {
    expect(shouldShowInlineSyncStatus(false)).toBe(true);
  });

  it('hides the inline banner when a custom title bar renders the status', () => {
    expect(shouldShowInlineSyncStatus(true)).toBe(false);
  });
});
