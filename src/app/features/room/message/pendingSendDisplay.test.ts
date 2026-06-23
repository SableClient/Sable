import { describe, expect, it } from 'vitest';

import { EventStatus } from '$types/matrix-sdk';

import {
  PENDING_SEND_DIM_DELAY_MS,
  getPendingSendDimDelayMs,
  isPendingSendStatus,
  resolvePendingSentAt,
  shouldDimPendingSend,
} from './pendingSendDisplay';

describe('pendingSendDisplay', () => {
  it('treats encrypting, queued, and sending events as pending', () => {
    expect(isPendingSendStatus(EventStatus.ENCRYPTING)).toBe(true);
    expect(isPendingSendStatus(EventStatus.QUEUED)).toBe(true);
    expect(isPendingSendStatus(EventStatus.SENDING)).toBe(true);
    expect(isPendingSendStatus(EventStatus.NOT_SENT)).toBe(false);
  });

  it('waits out the grace period before dimming a pending event', () => {
    expect(getPendingSendDimDelayMs(10_000, 10_500)).toBe(PENDING_SEND_DIM_DELAY_MS - 500);
    expect(shouldDimPendingSend(EventStatus.SENDING, 10_000, 11_999)).toBe(false);
    expect(shouldDimPendingSend(EventStatus.SENDING, 10_000, 12_000)).toBe(true);
  });

  it('dims immediately when the pending event is already older than the grace period', () => {
    expect(getPendingSendDimDelayMs(10_000, 14_500)).toBe(0);
    expect(shouldDimPendingSend(EventStatus.QUEUED, 10_000, 14_500)).toBe(true);
  });

  it('uses the current time when the event timestamp is missing or invalid', () => {
    expect(getPendingSendDimDelayMs(0, 14_500)).toBe(PENDING_SEND_DIM_DELAY_MS);
    expect(getPendingSendDimDelayMs(Number.NaN, 14_500)).toBe(PENDING_SEND_DIM_DELAY_MS);
    expect(shouldDimPendingSend(EventStatus.SENDING, 0, 14_500)).toBe(false);
  });

  it('prefers a stable fallback timestamp when the event timestamp is missing', () => {
    expect(resolvePendingSentAt(0, 12_000, 14_500)).toBe(12_000);
    expect(resolvePendingSentAt(Number.NaN, 12_000, 14_500)).toBe(12_000);
  });

  it('never dims non-pending send states', () => {
    expect(shouldDimPendingSend(EventStatus.NOT_SENT, 10_000, 14_500)).toBe(false);
    expect(shouldDimPendingSend(null, 10_000, 14_500)).toBe(false);
  });
});
