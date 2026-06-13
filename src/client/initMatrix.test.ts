import * as Sentry from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSentryMatrixDeviceContext,
  resolveRefreshToken,
  setSentryMatrixDeviceContext,
} from './initMatrix';

vi.mock('@sentry/react', () => ({
  setTag: vi.fn<(key: string, value: string) => void>(),
}));

describe('resolveRefreshToken', () => {
  it('keeps the current refresh token when the homeserver omits refresh_token', () => {
    expect(resolveRefreshToken('refresh-2')).toBe('refresh-2');
    expect(resolveRefreshToken('refresh-2', 'refresh-3')).toBe('refresh-3');
  });
});

describe('setSentryMatrixDeviceContext', () => {
  beforeEach(() => {
    vi.mocked(Sentry.setTag).mockClear();
  });

  it('sets matrix.device_id from the Matrix client', () => {
    setSentryMatrixDeviceContext({ getDeviceId: () => 'CLIENTDEVICE' });

    expect(Sentry.setTag).toHaveBeenCalledWith('matrix.device_id', 'CLIENTDEVICE');
  });

  it('falls back to the session device ID before the SDK client is available', () => {
    setSentryMatrixDeviceContext(null, { deviceId: 'SESSIONDEVICE' });

    expect(Sentry.setTag).toHaveBeenCalledWith('matrix.device_id', 'SESSIONDEVICE');
  });

  it('does not overwrite the tag when no device ID is available', () => {
    setSentryMatrixDeviceContext({ getDeviceId: () => null }, null);

    expect(Sentry.setTag).not.toHaveBeenCalled();
  });

  it('clears the device ID tag for full login data clears', () => {
    clearSentryMatrixDeviceContext();

    expect(Sentry.setTag).toHaveBeenCalledWith('matrix.device_id', 'none');
  });
});
