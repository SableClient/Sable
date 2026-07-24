import { describe, expect, it } from 'vitest';
import { mergePushConfig, resolveNotificationTransport } from './NotificationTransport';

describe('resolveNotificationTransport', () => {
  it('returns no provider when background push is disabled', () => {
    const result = resolveNotificationTransport({
      platform: 'android',
      enabled: false,
      mode: 'auto',
      unifiedPush: { available: true, status: 'ready' },
      nativePush: { available: true, status: 'ready' },
      webPush: { available: true, status: 'ready' },
    });

    expect(result.provider).toBeNull();
    expect(result.status).toBe('unavailable');
    expect(result.degraded).toBe(false);
  });

  it('prefers UnifiedPush on Android auto when it is available', () => {
    const result = resolveNotificationTransport({
      platform: 'android',
      enabled: true,
      mode: 'auto',
      unifiedPush: { available: true, status: 'ready' },
      nativePush: { available: true, status: 'ready' },
      webPush: { available: false, status: 'unavailable' },
    });

    expect(result.provider).toBe('unifiedpush');
    expect(result.status).toBe('ready');
    expect(result.degraded).toBe(false);
  });

  it('falls back to native push when UnifiedPush hard-fails', () => {
    const result = resolveNotificationTransport({
      platform: 'android',
      enabled: true,
      mode: 'auto',
      unifiedPush: { available: true, status: 'hard-failed' },
      nativePush: { available: true, status: 'ready' },
      webPush: { available: false, status: 'unavailable' },
    });

    expect(result.provider).toBe('native');
    expect(result.status).toBe('ready');
    expect(result.degraded).toBe(false);
  });

  it('does not fall back on temporary UnifiedPush unavailability', () => {
    const result = resolveNotificationTransport({
      platform: 'android',
      enabled: true,
      mode: 'auto',
      unifiedPush: { available: true, status: 'temp-unavailable' },
      nativePush: { available: true, status: 'ready' },
      webPush: { available: false, status: 'unavailable' },
    });

    expect(result.provider).toBe('unifiedpush');
    expect(result.status).toBe('temp-unavailable');
    expect(result.degraded).toBe(true);
  });

  it('does not treat desktop auto mode as web push', () => {
    const result = resolveNotificationTransport({
      platform: 'desktop',
      enabled: true,
      mode: 'auto',
      unifiedPush: { available: false, status: 'unavailable' },
      nativePush: { available: false, status: 'unavailable' },
      webPush: { available: true, status: 'ready' },
    });

    expect(result.provider).toBeNull();
    expect(result.status).toBe('unavailable');
    expect(result.degraded).toBe(false);
  });

  it('resolves browser web auto mode to web push when available', () => {
    const result = resolveNotificationTransport({
      platform: 'web',
      enabled: true,
      mode: 'auto',
      unifiedPush: { available: false, status: 'unavailable' },
      nativePush: { available: false, status: 'unavailable' },
      webPush: { available: true, status: 'ready' },
    });

    expect(result.provider).toBe('web');
    expect(result.status).toBe('ready');
    expect(result.degraded).toBe(false);
  });

  it('resolves iOS auto mode to native push when available', () => {
    const result = resolveNotificationTransport({
      platform: 'ios',
      enabled: true,
      mode: 'auto',
      unifiedPush: { available: false, status: 'unavailable' },
      nativePush: { available: true, status: 'ready' },
      webPush: { available: false, status: 'unavailable' },
    });

    expect(result.provider).toBe('native');
    expect(result.status).toBe('ready');
    expect(result.degraded).toBe(false);
  });

  it('does not resolve explicit native mode when native push is unavailable', () => {
    const result = resolveNotificationTransport({
      platform: 'ios',
      enabled: true,
      mode: 'native',
      unifiedPush: { available: false, status: 'unavailable' },
      nativePush: { available: false, status: 'unavailable' },
      webPush: { available: false, status: 'unavailable' },
    });

    expect(result.provider).toBeNull();
    expect(result.status).toBe('unavailable');
    expect(result.degraded).toBe(false);
  });

  it('does not resolve explicit web mode when web push is unavailable', () => {
    const result = resolveNotificationTransport({
      platform: 'desktop',
      enabled: true,
      mode: 'web',
      unifiedPush: { available: false, status: 'unavailable' },
      nativePush: { available: false, status: 'unavailable' },
      webPush: { available: false, status: 'unavailable' },
    });

    expect(result.provider).toBeNull();
    expect(result.status).toBe('unavailable');
    expect(result.degraded).toBe(false);
  });
});

describe('mergePushConfig', () => {
  it('keeps config.json defaults until a user override exists', () => {
    expect(
      mergePushConfig(
        { unifiedPushGatewayUrl: 'https://up.default.example', unifiedPushAppID: 'moe.sable.up' },
        { unifiedPushGatewayUrl: 'https://up.user.example' }
      )
    ).toEqual({
      unifiedPushGatewayUrl: 'https://up.user.example',
      unifiedPushAppID: 'moe.sable.up',
    });
  });
});
