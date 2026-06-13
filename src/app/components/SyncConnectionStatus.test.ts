import { describe, expect, it } from 'vitest';
import { SyncState } from '$types/matrix-sdk';
import { getSyncConnectionStatusView } from './SyncConnectionStatus';

describe('getSyncConnectionStatusView', () => {
  it('shows connecting for initial ready states', () => {
    expect(getSyncConnectionStatusView(SyncState.Syncing, null)).toEqual({
      text: 'Connecting...',
      variant: 'Success',
    });
  });

  it('does not show connecting after recovering from reconnecting', () => {
    expect(getSyncConnectionStatusView(SyncState.Syncing, SyncState.Reconnecting)).toBeNull();
  });

  it('does not show connecting after recovering from an error', () => {
    expect(getSyncConnectionStatusView(SyncState.Prepared, SyncState.Error)).toBeNull();
  });

  it('shows degraded states', () => {
    expect(getSyncConnectionStatusView(SyncState.Reconnecting, SyncState.Syncing)).toEqual({
      text: 'Connection Lost! Reconnecting...',
      variant: 'Warning',
    });
    expect(getSyncConnectionStatusView(SyncState.Error, SyncState.Reconnecting)).toEqual({
      text: 'Connection Lost!',
      variant: 'Critical',
    });
  });
});
