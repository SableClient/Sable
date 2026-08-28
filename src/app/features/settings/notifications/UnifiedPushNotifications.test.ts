import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as WebPushSupportModule from './webPushSupport';
import {
  DEFAULT_EMBEDDED_GATEWAY,
  discoverPushGateway,
  DEFAULT_UNIFIED_PUSH_APP_ID,
  disableUnifiedPush,
  listenForUnifiedPushMessages,
  clearRoomNotification,
  resetUnifiedPushNotificationStateForTests,
  tryEnableUnifiedPush,
} from './UnifiedPushNotifications';

type PluginListenerHandler = (data: unknown) => void;

const notificationsApi = vi.hoisted(() => ({
  sendNotification: vi.fn<(notification: Record<string, unknown>) => Promise<void>>(),
  removeActive: vi.fn<(notifications: Array<{ id: number }>) => Promise<void>>(),
  createChannel: vi.fn<() => void>(),
  removeChannel: vi.fn<() => Promise<void>>(),
  Importance: {
    Default: 3,
    High: 4,
  },
}));

const unifiedPushTransport = vi.hoisted(() => ({
  getUnifiedPushDistributor: vi.fn<() => void>(),
  getUnifiedPushDistributors: vi.fn<() => void>(),
  registerUnifiedPushTransport: vi.fn<() => Promise<unknown>>(),
  saveUnifiedPushDistributor: vi.fn<() => void>(),
  unregisterUnifiedPushTransport: vi.fn<() => Promise<void>>(),
}));

const getTauriNotificationsApi = vi.hoisted(() =>
  vi.fn<() => Promise<typeof notificationsApi>>().mockResolvedValue(notificationsApi)
);

const matrixClient = vi.hoisted(() => ({
  setPusher: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getDeviceId: vi.fn<() => string>(() => 'DEVICE'),
  getDevice: vi
    .fn<() => Promise<{ display_name: string }>>()
    .mockResolvedValue({ display_name: 'Pixel' }),
  getPushers: vi
    .fn<() => Promise<{ pushers: Array<unknown> }>>()
    .mockResolvedValue({ pushers: [] }),
  getSafeUserId: vi.fn<() => string>(() => '@user:example.com'),
  getUserId: vi.fn<() => string>(() => '@user:example.com'),
  getCrypto: vi.fn<() => unknown>(() => undefined),
  decryptEventIfNeeded: vi.fn<(event: unknown) => Promise<void>>(),
  getRoom: vi.fn<() => unknown>(() => undefined),
  fetchRoomEvent: vi.fn<() => Promise<unknown>>(),
}));

const invoke = vi.hoisted(() =>
  vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>()
);

const getWebPushServerSupport = vi.hoisted(() =>
  vi.fn<() => Promise<WebPushSupportModule.WebPushServerSupport>>()
);
const acknowledgeWebPushPusher = vi.hoisted(() =>
  vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
);

const addPluginListener = vi.hoisted(() =>
  vi.fn<
    (
      plugin: string,
      event: string,
      handler: PluginListenerHandler
    ) => Promise<{ unregister: () => Promise<void> }>
  >()
);

vi.mock('./UnifiedPushTransport', () => unifiedPushTransport);

vi.mock('./TauriNotificationsApiClient', () => ({
  getTauriNotificationsApi,
  isMobileTauri: () => false,
}));

vi.mock('@tauri-apps/api/core', () => ({
  addPluginListener,
  invoke,
  isTauri: () => false,
}));

vi.mock('$utils/fetch', () => ({
  fetch: (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args),
}));

vi.mock('./webPushSupport', async (importOriginal) => {
  const actual = await importOriginal<typeof WebPushSupportModule>();
  return { ...actual, getWebPushServerSupport, acknowledgeWebPushPusher };
});

function makeRoom() {
  return {
    name: 'Room',
    getJoinedMemberCount: () => 2,
    getLiveTimeline: () => ({ getEvents: () => [], getState: () => undefined }),
    getMember: () => undefined,
  };
}

const encryptedPush = (eventId: string) => ({
  type: 'm.room.encrypted',
  user_id: '@user:example.com',
  room_id: '!room:example.com',
  room_name: 'Room',
  event_id: eventId,
  content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'ciphertext' },
});

describe('UnifiedPushNotifications', () => {
  let pushHandler: (data: unknown) => void;

  beforeEach(() => {
    notificationsApi.sendNotification.mockResolvedValue(undefined);
    notificationsApi.removeActive.mockResolvedValue(undefined);
    notificationsApi.createChannel.mockResolvedValue(undefined);
    notificationsApi.removeChannel.mockResolvedValue(undefined);
    getTauriNotificationsApi.mockResolvedValue(notificationsApi);
    getWebPushServerSupport.mockResolvedValue({ supported: false });
    acknowledgeWebPushPusher.mockResolvedValue(undefined);
    unifiedPushTransport.registerUnifiedPushTransport.mockResolvedValue({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://up.example/device',
      distributor: 'org.unifiedpush.distributor.ntfy',
    });
    unifiedPushTransport.unregisterUnifiedPushTransport.mockResolvedValue(undefined);
    matrixClient.setPusher.mockClear();
    matrixClient.getPushers.mockResolvedValue({ pushers: [] });
    matrixClient.getCrypto.mockReturnValue(undefined);
    matrixClient.decryptEventIfNeeded.mockImplementation(async (event) => {
      const crypto = matrixClient.getCrypto();
      const mEvent = event as {
        shouldAttemptDecryption: () => boolean;
        attemptDecryption: (crypto: never) => Promise<void>;
      };
      if (crypto && mEvent.shouldAttemptDecryption()) {
        await mEvent.attemptDecryption(crypto as never);
      }
    });
    matrixClient.getRoom.mockReturnValue(undefined);
    invoke.mockResolvedValue(undefined);
    addPluginListener.mockImplementation(
      async (_plugin: string, _event: string, handler: (data: unknown) => void) => {
        pushHandler = handler;
        return { unregister: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
      }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('gateway probe failed'))
    );
  });

  afterEach(() => {
    resetUnifiedPushNotificationStateForTests();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function makeSettings(overrides: Record<string, unknown> = {}) {
    return {
      mx: matrixClient,
      showMessageContent: true,
      showEncryptedMessageContent: true,
      notificationSoundEnabled: true,
      useInAppNotifications: false,
      ...overrides,
    };
  }

  async function listenAndPush(payload: Record<string, unknown>, settings = makeSettings()) {
    await listenForUnifiedPushMessages(() => settings as never);
    pushHandler({
      message: JSON.stringify({ user_id: '@user:example.com', ...payload }),
    });
  }

  it('ignores pushes without an exact active-account identity', async () => {
    await listenForUnifiedPushMessages(() => makeSettings() as never);

    pushHandler({
      message: JSON.stringify({
        type: 'm.room.message',
        room_id: '!room:example.com',
        content: { body: 'unscoped' },
      }),
    });
    pushHandler({
      message: JSON.stringify({
        type: 'm.room.message',
        user_id: '@other:example.com',
        room_id: '!room:example.com',
        content: { body: 'wrong account' },
      }),
    });

    await vi.waitFor(() => expect(notificationsApi.sendNotification).not.toHaveBeenCalled());
    expect(matrixClient.getRoom).not.toHaveBeenCalled();
  });

  it('posts an encrypted baseline before a hanging local decryption completes', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    let resolveDecryption!: (content: Record<string, unknown>) => void;
    const decryption = new Promise<Record<string, unknown>>((resolve) => {
      resolveDecryption = resolve;
    });
    const crypto = {
      decryptEvent: vi.fn<() => Promise<Record<string, unknown>>>(() => decryption),
    };
    matrixClient.getCrypto.mockReturnValue(crypto);
    const order: string[] = [];
    notificationsApi.sendNotification.mockImplementation(async (notification) => {
      order.push(`post:${String(notification.body)}`);
    });
    crypto.decryptEvent.mockImplementation(() => {
      order.push('decrypt');
      return decryption;
    });

    await listenAndPush(encryptedPush('$baseline:example.com'));

    await vi.waitFor(() => expect(order).toEqual(['post:You: Encrypted message', 'decrypt']));

    resolveDecryption({
      clearEvent: {
        type: 'm.room.message',
        content: { body: 'decrypted message' },
      },
    });
    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledTimes(2));
  });

  it('posts message notifications as a conversation on the high-importance channel', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());

    await listenAndPush({
      type: 'm.room.message',
      room_id: '!room:example.com',
      room_name: 'Room',
      event_id: '$plain:example.com',
      sender: '@alice:example.com',
      sender_display_name: 'Alice',
      content: { body: 'hello' },
    });

    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());
    expect(notificationsApi.sendNotification.mock.calls[0]?.[0]).toMatchObject({
      channelId: 'messages.v2',
      groupConversation: false,
      messages: [{ body: 'hello', senderName: 'Alice', senderKey: '@alice:example.com' }],
    });
  });

  it('posts invitations on their own channel', async () => {
    await listenAndPush({
      type: 'm.room.member',
      room_id: '!room:example.com',
      room_name: 'Room',
      sender_display_name: 'Alice',
      content: { membership: 'invite' },
    });

    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());
    expect(notificationsApi.sendNotification.mock.calls[0]?.[0]).toMatchObject({
      channelId: 'invites',
      title: 'New Invitation',
    });
  });

  it('creates the messages channel at high importance and drops the legacy one', async () => {
    await tryEnableUnifiedPush(matrixClient as never);

    expect(notificationsApi.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'messages.v2', importance: 4 })
    );
    expect(notificationsApi.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'invites' })
    );
    expect(notificationsApi.removeChannel).toHaveBeenCalledWith('messages');
  });

  it('silently updates the same notification after encrypted decryption succeeds', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    matrixClient.getCrypto.mockReturnValue({
      decryptEvent: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
        clearEvent: {
          type: 'm.room.message',
          content: { body: 'decrypted message' },
        },
      }),
    });

    await listenAndPush(encryptedPush('$success:example.com'));

    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledTimes(2));
    const baseline = notificationsApi.sendNotification.mock.calls[0]?.[0];
    const enrichment = notificationsApi.sendNotification.mock.calls[1]?.[0];
    expect(baseline).toMatchObject({
      body: 'You: Encrypted message',
      silent: false,
    });
    expect(enrichment).toMatchObject({
      body: 'You: decrypted message',
      silent: true,
      id: (baseline as Record<string, unknown>).id,
    });
  });

  it('deduplicates rich encrypted pushes before decryption', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());

    await listenForUnifiedPushMessages(() => makeSettings() as never);
    const payload = encryptedPush('$duplicate:example.com');
    pushHandler({ message: JSON.stringify(payload) });
    pushHandler({ message: JSON.stringify(payload) });

    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());
  });

  it('does not decrypt when encrypted previews are disabled', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    const decryptEvent = vi.fn<() => void>();
    matrixClient.getCrypto.mockReturnValue({ decryptEvent });

    await listenAndPush(
      encryptedPush('$policy:example.com'),
      makeSettings({ showEncryptedMessageContent: false })
    );

    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());
    expect(decryptEvent).not.toHaveBeenCalled();
  });

  it('applies encrypted enrichment that only decrypts long after the baseline post', async () => {
    vi.useFakeTimers();
    try {
      matrixClient.getRoom.mockReturnValue(makeRoom());
      let resolveDecryption!: (content: Record<string, unknown>) => void;
      const decryption = new Promise<Record<string, unknown>>((resolve) => {
        resolveDecryption = resolve;
      });
      matrixClient.getCrypto.mockReturnValue({
        decryptEvent: vi.fn<() => Promise<Record<string, unknown>>>().mockReturnValue(decryption),
      });

      await listenAndPush(encryptedPush('$late:example.com'));
      await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());

      vi.advanceTimersByTime(30_000);
      resolveDecryption({
        clearEvent: {
          type: 'm.room.message',
          content: { body: 'late plaintext' },
        },
      });

      await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledTimes(2));
      expect(notificationsApi.sendNotification.mock.calls[1]?.[0]).toMatchObject({
        body: 'You: late plaintext',
        silent: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops waiting for the room key once the retry window elapses', async () => {
    vi.useFakeTimers();
    try {
      matrixClient.getRoom.mockReturnValue(makeRoom());
      let resolveDecryption!: (content: Record<string, unknown>) => void;
      const decryption = new Promise<Record<string, unknown>>((resolve) => {
        resolveDecryption = resolve;
      });
      matrixClient.getCrypto.mockReturnValue({
        decryptEvent: vi.fn<() => Promise<Record<string, unknown>>>().mockReturnValue(decryption),
      });

      await listenAndPush(encryptedPush('$expired:example.com'));
      await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());

      await vi.advanceTimersByTimeAsync(5 * 60_000);
      resolveDecryption({
        clearEvent: {
          type: 'm.room.message',
          content: { body: 'far too late' },
        },
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(notificationsApi.sendNotification).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a duplicate rich event after its initial native post fails', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    let attempts = 0;
    const posted: Record<string, unknown>[] = [];
    notificationsApi.sendNotification.mockImplementation(async (notification) => {
      attempts += 1;
      if (attempts === 1) throw new Error('native post failed');
      posted.push(notification);
    });

    await listenForUnifiedPushMessages(() => makeSettings() as never);
    const payload = encryptedPush('$retry:example.com');
    pushHandler({ message: JSON.stringify(payload) });
    pushHandler({ message: JSON.stringify(payload) });

    await vi.waitFor(() => expect(attempts).toBe(2));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ body: 'You: Encrypted message' });
  });

  it('does not recreate a cleared notification when enrichment resolves', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    let resolveDecryption!: (content: Record<string, unknown>) => void;
    const decryption = new Promise<Record<string, unknown>>((resolve) => {
      resolveDecryption = resolve;
    });
    matrixClient.getCrypto.mockReturnValue({
      decryptEvent: vi.fn<() => Promise<Record<string, unknown>>>().mockReturnValue(decryption),
    });

    const settings = makeSettings();
    await listenAndPush(encryptedPush('$clear:example.com'), settings);
    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());

    await clearRoomNotification('@user:example.com', '!room:example.com');
    resolveDecryption({
      clearEvent: {
        type: 'm.room.message',
        content: { body: 'must not return' },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(notificationsApi.sendNotification).toHaveBeenCalledOnce();
  });

  it('does not leave rolled-back content after concurrent room posts', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    let attempts = 0;
    const posted: Record<string, unknown>[] = [];
    notificationsApi.sendNotification.mockImplementation(async (notification) => {
      attempts += 1;
      if (attempts === 2) throw new Error('second native post failed');
      posted.push(notification);
    });

    await listenForUnifiedPushMessages(() => makeSettings() as never);
    pushHandler({
      message: JSON.stringify({
        ...encryptedPush('$first:example.com'),
        sender_display_name: 'First',
      }),
    });
    pushHandler({
      message: JSON.stringify({
        ...encryptedPush('$second:example.com'),
        sender_display_name: 'Second',
      }),
    });
    await vi.waitFor(() => expect(attempts).toBe(2));

    pushHandler({
      message: JSON.stringify({
        ...encryptedPush('$third:example.com'),
        sender_display_name: 'Third',
      }),
    });
    await vi.waitFor(() => expect(attempts).toBe(3));

    expect(posted).toHaveLength(2);
    expect(posted[1]).toMatchObject({ body: 'Third: Encrypted message' });
    expect(posted[1]?.inboxLines).not.toEqual(
      expect.arrayContaining(['Second: Encrypted message'])
    );
  });

  it('restores the complete rich cache after an evicting baseline post fails', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    let attempts = 0;
    const successfulPosts: Record<string, unknown>[] = [];
    notificationsApi.sendNotification.mockImplementation(async (notification) => {
      attempts += 1;
      if (attempts === 11) throw new Error('evicting native post failed');
      successfulPosts.push(notification);
    });

    await listenForUnifiedPushMessages(() => makeSettings() as never);
    for (let index = 1; index <= 10; index += 1) {
      pushHandler({
        message: JSON.stringify({
          ...encryptedPush(`$eviction-${index}:example.com`),
          sender_display_name: `Sender ${index}`,
        }),
      });
    }
    await vi.waitFor(() => expect(attempts).toBe(10));

    const retryPayload = {
      ...encryptedPush('$eviction-11:example.com'),
      sender_display_name: 'Sender 11',
    };
    pushHandler({ message: JSON.stringify(retryPayload) });
    await vi.waitFor(() => expect(attempts).toBe(11));
    pushHandler({ message: JSON.stringify(retryPayload) });
    await vi.waitFor(() => expect(attempts).toBe(12));

    expect(successfulPosts.at(-1)).toMatchObject({ body: 'Sender 11: Encrypted message' });
    expect(successfulPosts.at(-1)?.inboxLines).toEqual(
      expect.arrayContaining(['Sender 7: Encrypted message'])
    );
  });

  it('posts one notification per room and no account-level summary', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    await listenForUnifiedPushMessages(() => makeSettings() as never);
    const roomPayload = (roomId: string, eventId: string, roomName: string) => ({
      ...encryptedPush(eventId),
      room_id: roomId,
      room_name: roomName,
    });
    pushHandler({ message: JSON.stringify(roomPayload('!room-a:example.com', '$a', 'Room A')) });
    pushHandler({ message: JSON.stringify(roomPayload('!room-b:example.com', '$b', 'Room B')) });

    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledTimes(2));
    const posted = notificationsApi.sendNotification.mock.calls.map(
      ([notification]) => notification
    );
    expect(posted.some((notification) => notification.groupSummary)).toBe(false);
    expect(new Set(posted.map((notification) => notification.title))).toEqual(
      new Set(['Room A', 'Room B'])
    );
    expect(new Set(posted.map((notification) => notification.id)).size).toBe(2);
  });

  it('dismisses a group summary left behind by an older version', async () => {
    await listenForUnifiedPushMessages(() => makeSettings() as never);

    await vi.waitFor(() => expect(notificationsApi.removeActive).toHaveBeenCalledOnce());
    expect(notificationsApi.removeActive.mock.calls[0]?.[0]).toEqual([{ id: expect.any(Number) }]);
  });

  it('clears a room even when dismissing its notification fails', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    await listenForUnifiedPushMessages(() => makeSettings() as never);
    pushHandler({
      message: JSON.stringify({ ...encryptedPush('$a'), room_id: '!room-a:example.com' }),
    });
    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());

    notificationsApi.removeActive.mockRejectedValueOnce(new Error('child removal failed'));
    await expect(
      clearRoomNotification('@user:example.com', '!room-a:example.com')
    ).resolves.toBeUndefined();
  });

  it('checks preview policy again after a minimal event resolves', async () => {
    matrixClient.getRoom.mockReturnValue(makeRoom());
    let resolveEvent!: (event: unknown) => void;
    const fetched = new Promise<unknown>((resolve) => {
      resolveEvent = resolve;
    });
    matrixClient.fetchRoomEvent.mockReturnValue(fetched);
    const settings = makeSettings();

    await listenAndPush(
      {
        room_id: '!room:example.com',
        event_id: '$minimal-policy:example.com',
        counts: { unread: 1 },
      },
      settings
    );
    await vi.waitFor(() => expect(notificationsApi.sendNotification).toHaveBeenCalledOnce());
    settings.showMessageContent = false;
    resolveEvent({
      type: 'm.room.message',
      room_id: '!room:example.com',
      event_id: '$minimal-policy:example.com',
      sender: '@alice:example.com',
      content: { body: 'late plaintext' },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(notificationsApi.sendNotification).toHaveBeenCalledOnce();
  });

  it('activates the native listener only after registration resolves', async () => {
    const order: string[] = [];
    addPluginListener.mockImplementation(async () => {
      order.push('register');
      return { unregister: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
    });
    invoke.mockImplementation(async () => {
      order.push('activate');
    });

    await listenForUnifiedPushMessages(() => makeSettings() as never);

    expect(order).toEqual(['register', 'activate']);
    expect(invoke).toHaveBeenCalledWith('plugin:notifications|set_push_message_listener_active', {
      active: true,
    });
  });

  it('deactivates before unregistering even when deactivation fails', async () => {
    const order: string[] = [];
    const unregister = vi.fn<() => Promise<void>>(async () => {
      order.push('unregister');
    });
    addPluginListener.mockImplementation(async () => ({ unregister }));

    const handle = await listenForUnifiedPushMessages(() => makeSettings() as never);
    invoke.mockImplementation(async () => {
      order.push('deactivate');
      throw new Error('deactivation failed');
    });

    await expect(handle.unregister()).rejects.toThrow('deactivation failed');

    expect(order).toEqual(['deactivate', 'unregister']);
  });

  it('registers the Matrix pusher with the resolved UnifiedPush overrides', async () => {
    await expect(
      tryEnableUnifiedPush(matrixClient as never, {
        unifiedPushAppID: 'com.example.up',
        unifiedPushGatewayUrl: ' https://gateway.example/_matrix/push/v1/notify ',
      })
    ).resolves.toMatchObject({
      status: 'registered',
      endpoint: 'https://up.example/device',
    });

    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'com.example.up',
        pushkey: 'https://up.example/device',
        data: expect.objectContaining({
          url: 'https://gateway.example/_matrix/push/v1/notify',
        }),
      })
    );
  }, 15_000);

  it('registers an MSC4174 webpush pusher without a gateway when supported', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: 'hs-vapid' });
    unifiedPushTransport.registerUnifiedPushTransport.mockResolvedValue({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://fcm.googleapis.com/fcm/send/device',
      distributor: 'embedded.fcm.distributor',
      p256dh: 'p256-key',
      auth: 'auth-secret',
    });

    await expect(
      tryEnableUnifiedPush(matrixClient as never, {
        webPushAppID: 'moe.sable.app',
        vapidPublicKey: 'gateway-vapid',
      })
    ).resolves.toMatchObject({
      status: 'registered',
      endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    });

    expect(unifiedPushTransport.registerUnifiedPushTransport).toHaveBeenCalledWith(
      'hs-vapid',
      DEFAULT_EMBEDDED_GATEWAY,
      { userId: '@user:example.com', deviceId: 'DEVICE' }
    );
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'org.matrix.msc4174.webpush',
        app_id: 'moe.sable.app',
        pushkey: 'p256-key',
        data: expect.objectContaining({
          url: 'https://fcm.googleapis.com/fcm/send/device',
          auth: 'auth-secret',
          format: 'event_id_only',
          default_payload: { user_id: '@user:example.com' },
        }),
      })
    );
  }, 15_000);

  // The two features meet here: MSC4174 chooses the VAPID key, the built-in distributor
  // chooses the endpoint server, and both reach the same registration call.
  it('passes the MSC4174 key and the built-in distributor server together', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: 'hs-vapid' });
    unifiedPushTransport.registerUnifiedPushTransport.mockResolvedValue({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://ntfy.sh/upabc123',
      distributor: 'embedded-websocket',
    });

    await tryEnableUnifiedPush(matrixClient as never, {
      webPushAppID: 'moe.sable.app',
      vapidPublicKey: 'gateway-vapid',
      unifiedPushEmbeddedServerUrl: 'https://ntfy.sh',
    });

    expect(unifiedPushTransport.registerUnifiedPushTransport).toHaveBeenCalledWith(
      'hs-vapid',
      'https://ntfy.sh',
      { userId: '@user:example.com', deviceId: 'DEVICE' }
    );
  }, 15_000);

  it('prefers the endpoint provider as gateway when it proxies matrix push', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ unifiedpush: { gateway: 'matrix' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(discoverPushGateway('https://ntfy.example/upabc')).resolves.toBe(
      'https://ntfy.example/_matrix/push/v1/notify'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ntfy.example/_matrix/push/v1/notify',
      expect.objectContaining({ method: 'GET' })
    );
    vi.unstubAllGlobals();
  });

  it('falls back to the public gateway when the provider does not proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    );
    await expect(discoverPushGateway('https://up.example/dev')).resolves.toBe(
      'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify'
    );
    vi.unstubAllGlobals();
  });

  it('falls back to the public gateway when discovery is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<Response>>(async () => {
        throw new Error('offline');
      })
    );
    await expect(discoverPushGateway('https://up.example/dev')).resolves.toBe(
      'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify'
    );
    vi.unstubAllGlobals();
  });

  it('keeps the gateway webpush pusher when the homeserver does not support MSC4174', async () => {
    unifiedPushTransport.registerUnifiedPushTransport.mockResolvedValue({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://up.example/device',
      distributor: 'org.unifiedpush.distributor.ntfy',
      p256dh: 'p256-key',
      auth: 'auth-secret',
    });

    await tryEnableUnifiedPush(matrixClient as never, {
      webPushAppID: 'moe.sable.app',
      pushNotifyUrl: 'https://sygnal.example/_matrix/push/v1/notify',
      vapidPublicKey: 'gateway-vapid',
    });

    expect(unifiedPushTransport.registerUnifiedPushTransport).toHaveBeenCalledWith(
      'gateway-vapid',
      DEFAULT_EMBEDDED_GATEWAY,
      { userId: '@user:example.com', deviceId: 'DEVICE' }
    );
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'moe.sable.app',
        pushkey: 'p256-key',
        data: expect.objectContaining({
          url: 'https://sygnal.example/_matrix/push/v1/notify',
          endpoint: 'https://up.example/device',
          p256dh: 'p256-key',
          auth: 'auth-secret',
        }),
      })
    );
  }, 15_000);

  it('acknowledges MSC4174 activation pushes instead of notifying', async () => {
    await listenForUnifiedPushMessages(() => makeSettings() as never);

    pushHandler({
      message: JSON.stringify({ app_id: 'moe.sable.app', ack_token: 'token-123' }),
    });

    await vi.waitFor(() =>
      expect(acknowledgeWebPushPusher).toHaveBeenCalledWith(
        matrixClient,
        'moe.sable.app',
        'token-123'
      )
    );
    expect(notificationsApi.sendNotification).not.toHaveBeenCalled();
  });

  it('acknowledges MSC4174 activation pushes even without a user_id match', async () => {
    await listenForUnifiedPushMessages(() => makeSettings() as never);

    pushHandler({
      message: JSON.stringify({ app_id: 'moe.sable.app', ack_token: 'token-456' }),
    });

    await vi.waitFor(() => expect(acknowledgeWebPushPusher).toHaveBeenCalledOnce());
  });

  it('clears the UnifiedPush registration timeout after successful registration', async () => {
    vi.useFakeTimers();

    try {
      await expect(tryEnableUnifiedPush(matrixClient as never)).resolves.toMatchObject({
        status: 'registered',
      });

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the default UnifiedPush app id when no override is provided', async () => {
    await tryEnableUnifiedPush(matrixClient as never);

    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: DEFAULT_UNIFIED_PUSH_APP_ID,
      })
    );
  });

  it('removes current-device UnifiedPush pushers when the cached endpoint is unavailable', async () => {
    matrixClient.getPushers.mockResolvedValue({
      pushers: [
        {
          app_id: 'com.example.up',
          pushkey: 'stale-endpoint-1',
          device_display_name: 'Pixel',
          kind: 'http',
        },
        {
          app_id: 'com.example.up',
          pushkey: 'stale-endpoint-2',
          device_display_name: 'Pixel',
          kind: 'http',
        },
        {
          app_id: 'com.example.up',
          pushkey: 'stale-webpush-key',
          device_display_name: 'Pixel',
          kind: 'org.matrix.msc4174.webpush',
        },
        {
          app_id: 'com.example.up',
          pushkey: 'other-device-endpoint',
          device_display_name: 'Other Phone',
          kind: 'http',
        },
      ],
    });

    await disableUnifiedPush(matrixClient as never, {
      config: {
        unifiedPushAppID: 'com.example.up',
      },
    });

    expect(matrixClient.setPusher).toHaveBeenCalledTimes(3);
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'com.example.up',
        pushkey: 'stale-endpoint-1',
      })
    );
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'com.example.up',
        pushkey: 'stale-endpoint-2',
      })
    );
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'com.example.up',
        pushkey: 'stale-webpush-key',
      })
    );
    expect(unifiedPushTransport.unregisterUnifiedPushTransport).toHaveBeenCalledOnce();
  });
});
