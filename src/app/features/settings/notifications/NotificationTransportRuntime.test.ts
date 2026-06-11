import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationTransportRuntimeContext } from './NotificationTransportRuntime';
import { NotificationTransportRuntime } from './NotificationTransportRuntime';

const unifiedPushListener = vi.hoisted(() => vi.fn());
const unifiedPushUnregister = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('./UnifiedPushNotifications', () => ({
  listenForUnifiedPushMessages: unifiedPushListener,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function createContext(): NotificationTransportRuntimeContext {
  return {
    mx: {} as never,
    showMessageContent: true,
    showEncryptedMessageContent: false,
    notificationSoundEnabled: true,
    useInAppNotifications: false,
  };
}

describe('NotificationTransportRuntime', () => {
  it('subscribes only to the resolved provider listener', async () => {
    unifiedPushListener.mockResolvedValueOnce({
      unregister: unifiedPushUnregister,
    });

    const runtime = new NotificationTransportRuntime({
      unifiedpush: unifiedPushListener,
    });

    await runtime.sync('unifiedpush', () => createContext());

    expect(unifiedPushListener).toHaveBeenCalledOnce();
    expect(unifiedPushListener).toHaveBeenCalledWith(expect.any(Function));
    expect(unifiedPushUnregister).not.toHaveBeenCalled();
  });

  it('cleans up the active listener when the provider changes', async () => {
    unifiedPushListener.mockResolvedValueOnce({
      unregister: unifiedPushUnregister,
    });

    const runtime = new NotificationTransportRuntime({
      unifiedpush: unifiedPushListener,
    });

    await runtime.sync('unifiedpush', () => createContext());
    await runtime.sync('native', () => createContext());

    expect(unifiedPushUnregister).toHaveBeenCalledOnce();
  });

  it('does not recreate the listener when the provider stays the same', async () => {
    unifiedPushListener.mockResolvedValueOnce({
      unregister: unifiedPushUnregister,
    });

    const runtime = new NotificationTransportRuntime({
      unifiedpush: unifiedPushListener,
    });

    await runtime.sync('unifiedpush', () => createContext());
    await runtime.sync('unifiedpush', () => ({
      ...createContext(),
      notificationSoundEnabled: false,
    }));

    expect(unifiedPushListener).toHaveBeenCalledOnce();
    expect(unifiedPushUnregister).not.toHaveBeenCalled();
  });

  it('disposes a stale listener registration when the provider changes mid-startup', async () => {
    let resolveListener: (() => void) | undefined;
    const lateUnregister = vi.fn().mockResolvedValue(undefined);
    const lateListener = new Promise<{ unregister: typeof lateUnregister }>((resolve) => {
      resolveListener = () => resolve({ unregister: lateUnregister });
    });
    const slowListener = vi.fn().mockReturnValueOnce(lateListener);

    const runtime = new NotificationTransportRuntime({
      unifiedpush: slowListener,
    });

    const firstSync = runtime.sync('unifiedpush', () => createContext());
    const secondSync = runtime.sync('native', () => createContext());
    resolveListener?.();

    await Promise.all([firstSync, secondSync]);

    expect(lateUnregister).toHaveBeenCalledOnce();
  });

  it('disposes the active listener when stopped', async () => {
    unifiedPushListener.mockResolvedValueOnce({
      unregister: unifiedPushUnregister,
    });

    const runtime = new NotificationTransportRuntime({
      unifiedpush: unifiedPushListener,
    });

    await runtime.sync('unifiedpush', () => createContext());
    await runtime.dispose();

    expect(unifiedPushUnregister).toHaveBeenCalledOnce();
  });

  it('does not treat providers without listener factories as active', async () => {
    const nativeListener = vi.fn().mockResolvedValue({
      unregister: vi.fn().mockResolvedValue(undefined),
    });
    const listenerFactories: Record<string, typeof nativeListener> = {};
    const runtime = new NotificationTransportRuntime(listenerFactories);

    await runtime.sync('native', () => createContext());

    listenerFactories.native = nativeListener;
    await runtime.sync('native', () => createContext());

    expect(nativeListener).toHaveBeenCalledOnce();
  });
});
