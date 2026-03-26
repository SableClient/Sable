import type { MatrixClient } from '$types/matrix-sdk';

export type NotificationTransportProvider = 'unifiedpush' | 'native' | 'web';

export type NotificationTransportRuntimeContext = {
  mx: MatrixClient;
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
  notificationSoundEnabled: boolean;
  useInAppNotifications: boolean;
};

export type NotificationTransportListenerHandle = {
  unregister: () => Promise<void> | void;
};

export type NotificationTransportListenerFactory = (
  getContext: () => NotificationTransportRuntimeContext
) => Promise<NotificationTransportListenerHandle>;

export type NotificationTransportListenerFactories = Partial<
  Record<NotificationTransportProvider, NotificationTransportListenerFactory>
>;

type NotificationTransportListenerCleanup = () => Promise<void> | void;

const defaultListenerFactories: NotificationTransportListenerFactories = {
  unifiedpush: async (getContext) => {
    const { listenForUnifiedPushMessages } = await import('./UnifiedPushNotifications');
    return listenForUnifiedPushMessages(getContext);
  },
};

export class NotificationTransportRuntime {
  #listenerFactories: NotificationTransportListenerFactories;

  #activeProvider: NotificationTransportProvider | null = null;

  #activeGeneration = 0;

  #cleanup: NotificationTransportListenerCleanup | null = null;

  constructor(
    listenerFactories: NotificationTransportListenerFactories = defaultListenerFactories
  ) {
    this.#listenerFactories = listenerFactories;
  }

  async sync(
    provider: NotificationTransportProvider | null,
    getContext: () => NotificationTransportRuntimeContext
  ): Promise<void> {
    if (provider === this.#activeProvider) return;

    const listenerFactory = provider ? this.#listenerFactories[provider] : undefined;
    const nextActiveProvider = listenerFactory ? provider : null;

    const generation = this.#activeGeneration + 1;
    this.#activeGeneration = generation;
    const previousCleanup = this.#cleanup;
    this.#cleanup = null;
    this.#activeProvider = nextActiveProvider;

    if (previousCleanup) {
      await Promise.resolve(previousCleanup()).catch(() => undefined);
    }

    if (generation !== this.#activeGeneration) return;
    if (!listenerFactory) return;

    const listener = await listenerFactory(getContext);
    if (generation !== this.#activeGeneration || nextActiveProvider !== this.#activeProvider) {
      await Promise.resolve(listener.unregister()).catch(() => undefined);
      return;
    }

    this.#cleanup = () => listener.unregister();
  }

  async dispose(): Promise<void> {
    this.#activeGeneration += 1;
    const cleanup = this.#cleanup;
    this.#cleanup = null;
    this.#activeProvider = null;

    if (!cleanup) return;
    await Promise.resolve(cleanup()).catch(() => undefined);
  }
}
