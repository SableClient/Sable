import { describe, expect, it, vi } from 'vitest';
import { switchBackgroundPushTransport } from './SystemNotification';
import type { NotificationTransportProvider } from './NotificationTransport';

describe('switchBackgroundPushTransport', () => {
  it('deactivates the previous transport before activating the new one', async () => {
    const order: string[] = [];
    const deactivate = vi
      .fn<(kind: NotificationTransportProvider | null) => Promise<void>>()
      .mockImplementation(async (kind) => {
        order.push(`deactivate:${kind}`);
      });
    const activate = vi
      .fn<() => Promise<NotificationTransportProvider | null>>()
      .mockImplementation(async () => {
        order.push('activate');
        return 'native';
      });

    const nextKind = await switchBackgroundPushTransport({
      previousKind: 'unifiedpush',
      activate,
      deactivate,
    });

    expect(nextKind).toBe('native');
    expect(order).toEqual(['deactivate:unifiedpush', 'activate']);
  });

  it('skips deactivate when there is no previous transport', async () => {
    const deactivate = vi.fn<(kind: NotificationTransportProvider | null) => Promise<void>>();
    const activate = vi
      .fn<() => Promise<NotificationTransportProvider | null>>()
      .mockResolvedValue('native');

    const nextKind = await switchBackgroundPushTransport({
      previousKind: null,
      activate,
      deactivate,
    });

    expect(nextKind).toBe('native');
    expect(deactivate).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledOnce();
  });

  it('propagates a deactivate failure without activating', async () => {
    const deactivate = vi
      .fn<(kind: NotificationTransportProvider | null) => Promise<void>>()
      .mockRejectedValue(new Error('unregister failed'));
    const activate = vi.fn<() => Promise<NotificationTransportProvider | null>>();

    await expect(
      switchBackgroundPushTransport({
        previousKind: 'unifiedpush',
        activate,
        deactivate,
      })
    ).rejects.toThrow('unregister failed');

    expect(activate).not.toHaveBeenCalled();
  });

  it('restores the previous transport when activation fails, then rethrows', async () => {
    const order: string[] = [];
    const deactivate = vi
      .fn<(kind: NotificationTransportProvider | null) => Promise<void>>()
      .mockImplementation(async (kind) => {
        order.push(`deactivate:${kind}`);
      });
    const activate = vi
      .fn<() => Promise<NotificationTransportProvider | null>>()
      .mockRejectedValue(new Error('register failed'));
    const reactivate = vi
      .fn<(kind: NotificationTransportProvider) => Promise<void>>()
      .mockImplementation(async (kind) => {
        order.push(`reactivate:${kind}`);
      });

    await expect(
      switchBackgroundPushTransport({
        previousKind: 'unifiedpush',
        activate,
        deactivate,
        reactivate,
      })
    ).rejects.toThrow('register failed');

    expect(order).toEqual(['deactivate:unifiedpush', 'reactivate:unifiedpush']);
  });
});
