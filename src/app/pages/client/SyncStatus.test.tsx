import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import {
  CONNECTING_STATUS_DISPLAY_MS,
  RECONNECTING_STATUS_DISPLAY_MS,
  SyncStatus,
} from './SyncStatus';

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
  getSlidingSyncManager: () => ({
    retryNow: vi.fn<() => void>(),
  }),
}));

function emitSyncState(current: SyncState, previous: SyncState | null | undefined = null): void {
  syncStateSubscribers.forEach((subscriber) => subscriber(current, previous ?? null));
}

function makeMx(syncState: SyncState | null = SyncState.Syncing): MatrixClient & {
  retryImmediately: ReturnType<typeof vi.fn<() => boolean>>;
} {
  return {
    getSyncState: () => syncState,
    retryImmediately: vi.fn<() => boolean>(() => true),
  } as unknown as MatrixClient & {
    retryImmediately: ReturnType<typeof vi.fn<() => boolean>>;
  };
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

  it('offers a manual retry while sync is degraded', () => {
    const mx = makeMx(SyncState.Error);
    render(<SyncStatus mx={mx} />);

    act(() => {
      emitSyncState(SyncState.Error, SyncState.Reconnecting);
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mx.retryImmediately).toHaveBeenCalledOnce();
  });

  it('does not show the reconnecting banner during the first reconnect grace window', () => {
    const mx = makeMx(SyncState.Reconnecting);
    render(<SyncStatus mx={mx} />);

    act(() => {
      emitSyncState(SyncState.Reconnecting, SyncState.Syncing);
    });

    act(() => {
      vi.advanceTimersByTime(RECONNECTING_STATUS_DISPLAY_MS - 1);
    });

    expect(screen.queryByText('Connection Lost! Reconnecting...')).not.toBeInTheDocument();
  });

  it('shows the reconnecting banner after reconnecting remains degraded', () => {
    const mx = makeMx(SyncState.Reconnecting);
    render(<SyncStatus mx={mx} />);

    act(() => {
      emitSyncState(SyncState.Reconnecting, SyncState.Syncing);
    });

    act(() => {
      vi.advanceTimersByTime(RECONNECTING_STATUS_DISPLAY_MS);
    });

    expect(screen.getByText('Connection Lost! Reconnecting...')).toBeInTheDocument();
  });

  it('does not show reconnecting if sync recovers during the reconnect grace window', () => {
    const mx = makeMx(SyncState.Syncing);
    render(<SyncStatus mx={mx} />);

    act(() => {
      emitSyncState(SyncState.Reconnecting, SyncState.Syncing);
    });

    act(() => {
      vi.advanceTimersByTime(RECONNECTING_STATUS_DISPLAY_MS / 2);
      emitSyncState(SyncState.Syncing, SyncState.Reconnecting);
    });

    act(() => {
      vi.advanceTimersByTime(RECONNECTING_STATUS_DISPLAY_MS);
    });

    expect(screen.queryByText('Connection Lost! Reconnecting...')).not.toBeInTheDocument();
  });
});
