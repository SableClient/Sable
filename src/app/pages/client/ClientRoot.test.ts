import { describe, expect, it } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { isTelemetryContextReady } from './ClientRoot';

describe('isTelemetryContextReady', () => {
  it('returns false while loading', () => {
    const mx = { getSyncState: () => 'SYNCING' } as MatrixClient;
    expect(isTelemetryContextReady(mx, true)).toBe(false);
  });

  it('returns false without matrix client', () => {
    expect(isTelemetryContextReady(undefined, false)).toBe(false);
  });

  it('returns false before ready sync states', () => {
    const mx = { getSyncState: () => 'RECONNECTING' } as MatrixClient;
    expect(isTelemetryContextReady(mx, false)).toBe(false);
  });

  it('returns true once sync is ready and loading is complete', () => {
    const mx = { getSyncState: () => 'SYNCING' } as MatrixClient;
    expect(isTelemetryContextReady(mx, false)).toBe(true);
  });
});
