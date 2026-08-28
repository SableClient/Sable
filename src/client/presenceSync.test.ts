import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { PresenceSyncManager } from './presenceSync';

describe('PresenceSyncManager', () => {
  it('does not consume to-device events already handled by sliding sync', async () => {
    const preprocessToDeviceMessages = vi.fn<(...args: never[]) => Promise<never[]>>();
    const authedRequest = vi
      .fn<() => Promise<{ next_batch: string; to_device: { events: object[] } }>>()
      .mockResolvedValue({
        next_batch: 'next',
        to_device: { events: [{ type: 'm.key.verification.key' }] },
      });
    const mx = {
      getCrypto: () => ({ preprocessToDeviceMessages }),
      getUserId: () => '@me:example.org',
      getOrCreateFilter: vi.fn<() => Promise<string>>().mockResolvedValue('presence-filter'),
      http: { authedRequest },
    } as unknown as MatrixClient;
    const manager = new PresenceSyncManager(mx, 1, 60_000);

    manager.start();
    await vi.waitFor(() => expect(authedRequest).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    manager.dispose();

    expect(preprocessToDeviceMessages).not.toHaveBeenCalled();
  });
});
