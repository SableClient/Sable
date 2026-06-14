import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { CONNECTING_STATUS_DISPLAY_MS, SyncStatus } from './SyncStatus';

type SyncStateSubscriber = (current: SyncState, previous: SyncState | null) => void;

const syncStateSubscribers = new Set<SyncStateSubscriber>();

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: () => 'macos',
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<() => void>(),
  captureMessage: vi.fn<() => void>(),
  metrics: {
    count: vi.fn<() => void>(),
  },
}));

vi.mock('$hooks/useSyncState', () => ({
  useSyncState: (_mx: MatrixClient | undefined, onChange: SyncStateSubscriber) => {
    syncStateSubscribers.add(onChange);
  },
}));

vi.mock('$client/initMatrix', () => ({
  getClientSyncDiagnostics: () => ({
    syncState: 'SYNCING',
    transport: 'classic',
  }),
}));

function emitSyncState(current: SyncState, previous: SyncState | null | undefined = null): void {
  syncStateSubscribers.forEach((subscriber) => subscriber(current, previous ?? null));
}

function makeMx(syncState: SyncState | null = SyncState.Syncing): MatrixClient {
  return {
    getSyncState: () => syncState,
  } as unknown as MatrixClient;
}

describe('SyncStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncStateSubscribers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    syncStateSubscribers.clear();
  });

  it('clears the initial connecting banner after a short success display', () => {
    render(<SyncStatus mx={makeMx()} />);

    act(() => {
      emitSyncState(SyncState.Syncing, null);
    });

    expect(screen.getByText('Connecting...')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(CONNECTING_STATUS_DISPLAY_MS);
    });

    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
  });
});
