import { describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() =>
  vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>()
);

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { getUnifiedPushTransportApi } from './UnifiedPushTransportApiClient';

describe('UnifiedPushTransportApiClient', () => {
  it('registers with provider: "unifiedpush" so the plugin routes through the distributor explicitly', async () => {
    invoke.mockResolvedValueOnce({
      deviceToken: 'up-endpoint',
      p256dh: 'p256dh',
      auth: 'auth',
    });

    const api = await getUnifiedPushTransportApi();
    await api.registerForPushNotifications('vapid-pub');

    expect(invoke).toHaveBeenCalledWith('plugin:notifications|register_for_push_notifications', {
      vapid: 'vapid-pub',
      provider: 'unifiedpush',
    });
  });
});
