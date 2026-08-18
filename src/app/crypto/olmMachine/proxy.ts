import { createDebugLogger } from '$utils/debugLogger';
import { engineClose } from '$generated/tauri/commands';
import {
  encodeDecryptionSettings,
  encodeEncryptionSettings,
  encodeRoomSettings,
  graftWasmPrototypes,
  keyToBase64,
  RustSdkCryptoJs,
  toMegolmDecryptionError,
} from './wasmClasses';
import { engineInvoke, type EngineIdentity } from './engineInvoke';
import type { HydrationContext } from './hydrate';

const proxyLog = createDebugLogger('rust-crypto-proxy');

// Stands in for matrix-sdk-crypto-wasm's `OlmMachine`, forwarding calls to the Tauri host.

export type EngineOpenInfo = {
  userId: string;
  deviceId: string;
  ed25519Key: string;
  curve25519Key: string;
  deviceCreationTimeMs: number;
};

export type StartedVerification = {
  request: unknown;
  outgoingRequest: unknown;
};

const base64Key = (key: string) => ({
  toBase64: () => key,
  toString: () => key,
});

const toBase64 = (bytes: unknown): string =>
  bytes instanceof Uint8Array
    ? btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')
    : String(bytes);

const idValue = (id: string) => ({
  toString: () => id,
  localpart: () => id.replace(/^@/, '').split(':')[0],
});

type WatchedFlow = {
  userId: string;
  request?: Record<string, unknown>;
  sas?: Record<string, unknown>;
  qr?: Record<string, unknown>;
};

const VERIFICATION_SLOT: Record<string, 'sas' | 'qr' | undefined> = {
  Sas: 'sas',
  Qr: 'qr',
};

const VERIFICATION_MUTATION_PREFIXES = [
  'verificationRequest.',
  'sas.',
  'qr.',
  'device.requestVerification',
  'userIdentity.requestVerification',
  'userIdentity.requestVerificationDm',
] as const;

const isVerificationMutation = (method: string): boolean =>
  method === 'receiveSyncChanges' ||
  method === 'receiveVerificationEvent' ||
  VERIFICATION_MUTATION_PREFIXES.some((prefix) => method.startsWith(prefix));

export class OlmMachineProxy {
  roomKeyRequestsEnabled = false;

  readonly #identity: EngineIdentity;

  readonly #info: EngineOpenInfo;

  #closed = false;

  #roomKeyUpdatedCallback?: (sessions: unknown[]) => void;

  #roomKeysWithheldCallback?: (withheld: unknown[]) => void;

  #userIdentityUpdatedCallback?: (userId: unknown) => void;

  #devicesUpdatedCallback?: (userIds: string[]) => void;

  #receiveSecretCallback?: (name: string, value: string) => void;

  readonly #pending: { id?: unknown }[] = [];

  readonly #changesCallbacks = new Map<string, Set<() => void>>();

  readonly #watchedFlows = new Map<string, WatchedFlow>();

  readonly #hydration: HydrationContext = {
    call: (method, args) => this.#call(method, args),
    queueOutgoing: (label, pending, flowId) => {
      void pending.then(
        (request) => {
          if (request) this.#pending.push(request as { id?: unknown });
        },
        (error) => {
          proxyLog.error('error', `Rust crypto engine failed on ${label}`, error);
          // js-sdk already resolved this action; nudge the flow so the UI re-reads state.
          if (flowId) this.emit.verificationChanged(flowId);
        }
      );
    },
    watchChanges: (flowId, callback) => {
      const callbacks = this.#changesCallbacks.get(flowId) ?? new Set();
      callbacks.add(callback);
      this.#changesCallbacks.set(flowId, callbacks);
    },
    trackVerification: (kind, record) => {
      const flowId = typeof record.flowId === 'string' ? record.flowId : '';
      const userId =
        typeof record.otherUserId === 'string'
          ? record.otherUserId
          : typeof record.userId === 'string'
            ? record.userId
            : '';
      if (!flowId || !userId) return;
      const watched = this.#watchedFlows.get(flowId) ?? { userId };
      watched.userId = userId;
      if (kind === 'request') watched.request ??= record;
      if (kind === 'sas') watched.sas ??= record;
      if (kind === 'qr') watched.qr ??= record;
      this.#watchedFlows.set(flowId, watched);
    },
  };

  constructor(info: EngineOpenInfo) {
    this.#info = info;
    this.#identity = { userId: info.userId, deviceId: info.deviceId };
  }

  async #call(method: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (this.#closed) {
      throw new Error('Attempt to use a moved value');
    }
    const rawResult = await engineInvoke(this.#identity, method, args);
    if (isVerificationMutation(method)) {
      const flowId = typeof args.flowId === 'string' ? args.flowId : undefined;
      await this.#refreshVerificationFlows(flowId);
    }
    return graftWasmPrototypes(rawResult, this.#hydration);
  }

  async #refreshVerificationFlows(onlyFlowId?: string): Promise<void> {
    const flowIds = onlyFlowId ? [onlyFlowId] : [...this.#watchedFlows.keys()];
    for (const flowId of flowIds) {
      // eslint-disable-next-line no-await-in-loop
      await this.#refreshVerificationFlow(flowId);
    }
  }

  async #refreshVerificationFlow(flowId: string): Promise<void> {
    const watched = this.#watchedFlows.get(flowId);
    if (!watched) return;

    let raw: Record<string, unknown>;
    try {
      raw = (await engineInvoke(this.#identity, 'verificationRequest.state', {
        userId: watched.userId,
        flowId,
      })) as Record<string, unknown>;
    } catch {
      // A transitioned flow can move out of Rust's request store before its SAS/QR verifier is
      // exposed there. Query the verifier store directly and keep the original request wrapper.
      let verification: Record<string, unknown> | null;
      try {
        verification = (await engineInvoke(this.#identity, 'verification.state', {
          userId: watched.userId,
          flowId,
        })) as Record<string, unknown> | null;
      } catch {
        return;
      }
      if (!verification || typeof verification !== 'object') {
        const confirmed =
          typeof watched.sas?.haveWeConfirmed === 'function' && watched.sas.haveWeConfirmed();
        if (!confirmed) return;
        if (watched.sas) {
          patchSnapshot(watched.sas, { isDone: true }, []);
        }
        if (watched.request) {
          patchSnapshot(
            watched.request,
            {
              phase: RustSdkCryptoJs.VerificationRequestPhase.Done,
              isDone: true,
              isReady: false,
            },
            []
          );
        }
        this.emit.verificationChanged(flowId);
        return;
      }
      this.#patchVerificationSnapshot(flowId, watched, verification);
      this.emit.verificationChanged(flowId);
      return;
    }

    if (!raw || typeof raw !== 'object' || raw.className !== 'VerificationRequest') {
      return;
    }

    if (watched.request) {
      patchSnapshot(watched.request, raw, ['className', 'flowId']);
    }

    const nestedRaw = raw.verification as Record<string, unknown> | null | undefined;
    if (nestedRaw && typeof nestedRaw === 'object') {
      this.#patchVerificationSnapshot(flowId, watched, nestedRaw);
    } else if (watched.request) {
      defineMethodField(watched.request, 'getVerification', null);
    }

    this.emit.verificationChanged(flowId);
  }

  #patchVerificationSnapshot(
    flowId: string,
    watched: WatchedFlow,
    snapshot: Record<string, unknown>
  ): void {
    const slot = VERIFICATION_SLOT[snapshot.className as string];
    if (!slot) return;
    const current = watched[slot];
    if (current) {
      patchSnapshot(current, snapshot, ['className', 'flowId']);
    } else {
      watched[slot] = graftWasmPrototypes({ ...snapshot }, this.#hydration) as Record<
        string,
        unknown
      >;
    }
    if (watched.request) {
      defineMethodField(watched.request, 'getVerification', watched[slot]);
    }
  }

  get userId() {
    return idValue(this.#info.userId);
  }

  get deviceId() {
    return idValue(this.#info.deviceId);
  }

  get identityKeys() {
    return {
      ed25519: base64Key(this.#info.ed25519Key),
      curve25519: base64Key(this.#info.curve25519Key),
    };
  }

  get deviceCreationTimeMs() {
    return this.#info.deviceCreationTimeMs;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    void engineClose({
      userId: this.#identity.userId,
      deviceId: this.#identity.deviceId,
    }).catch((error) => proxyLog.error('error', 'Failed to close the Rust crypto engine', error));
  }

  free(): void {
    this.close();
  }

  async receiveSyncChanges(
    toDeviceEvents: string,
    changedDevices: unknown,
    oneTimeKeysCounts: Map<string, number> | Record<string, number>,
    unusedFallbackKeys?: unknown
  ): Promise<unknown> {
    return this.#call('receiveSyncChanges', {
      toDeviceEvents,
      changedDevices: toStringArray((changedDevices as { changed?: unknown })?.changed),
      leftDevices: toStringArray((changedDevices as { left?: unknown })?.left),
      oneTimeKeysCounts: toRecord(oneTimeKeysCounts),
      unusedFallbackKeys: unusedFallbackKeys ? toStringArray(unusedFallbackKeys) : null,
    });
  }

  async receiveVerificationEvent(event: string, roomId: unknown): Promise<void> {
    await this.#call('receiveVerificationEvent', {
      event,
      roomId: String(roomId),
    });

    let parsed: {
      event_id?: unknown;
      type?: unknown;
      sender?: unknown;
      content?: { msgtype?: unknown };
    };
    try {
      parsed = JSON.parse(event) as typeof parsed;
    } catch {
      return;
    }

    if (
      parsed.type === 'm.room.message' &&
      parsed.content?.msgtype === 'm.key.verification.request' &&
      typeof parsed.sender === 'string' &&
      typeof parsed.event_id === 'string'
    ) {
      // js-sdk performs a synchronous lookup as soon as this promise resolves.
      await this.#call('getVerificationRequest', {
        userId: parsed.sender,
        flowId: parsed.event_id,
      });
    }
  }

  async outgoingRequests(): Promise<unknown[]> {
    return [...this.#pending, ...((await this.#call('outgoingRequests')) as unknown[])];
  }

  async markRequestAsSent(requestId: string, requestType: number, response: string): Promise<void> {
    const queued = this.#pending.findIndex((request) => String(request.id) === requestId);
    if (queued !== -1) {
      // Ack proxy-owned ids locally: the engine's machine never issued them.
      this.#pending.splice(queued, 1);
      return;
    }
    await this.#call('markRequestAsSent', { requestId, requestType, response });
  }

  async decryptRoomEvent(event: string, roomId: unknown, ...rest: unknown[]): Promise<unknown> {
    try {
      return await this.#call('decryptRoomEvent', {
        event,
        roomId: String(roomId),
        decryptionSettings: encodeDecryptionSettings(rest.at(-1)),
      });
    } catch (error) {
      throw toMegolmDecryptionError(error);
    }
  }

  async encryptRoomEvent(roomId: unknown, eventType: string, content: string): Promise<unknown> {
    return this.#call('encryptRoomEvent', {
      roomId: String(roomId),
      eventType,
      content,
    });
  }

  async encryptStateEvent(roomId: unknown, eventType: string, content: string): Promise<unknown> {
    return this.#call('encryptStateEvent', {
      roomId: String(roomId),
      eventType,
      content,
    });
  }

  async getRoomEventEncryptionInfo(event: string, roomId: unknown): Promise<unknown> {
    return this.#call('getRoomEventEncryptionInfo', {
      event,
      roomId: String(roomId),
    });
  }

  async shareRoomKey(
    roomId: unknown,
    users: unknown[],
    encryptionSettings: unknown
  ): Promise<unknown> {
    return this.#call('shareRoomKey', {
      roomId: String(roomId),
      users: toStringArray(users),
      encryptionSettings: encodeEncryptionSettings(encryptionSettings),
    });
  }

  async getMissingSessions(users: unknown[]): Promise<unknown> {
    return this.#call('getMissingSessions', { users: toStringArray(users) });
  }

  async invalidateGroupSession(roomId: unknown): Promise<unknown> {
    return this.#call('invalidateGroupSession', { roomId: String(roomId) });
  }

  async getRoomSettings(roomId: unknown): Promise<unknown> {
    return this.#call('getRoomSettings', { roomId: String(roomId) });
  }

  async setRoomSettings(roomId: unknown, settings: unknown): Promise<void> {
    await this.#call('setRoomSettings', {
      roomId: String(roomId),
      settings: encodeRoomSettings(settings),
    });
  }

  async roomKeyCounts(): Promise<unknown> {
    return this.#call('roomKeyCounts');
  }

  async getDevice(userId: unknown, deviceId: unknown, timeoutSecs?: number): Promise<unknown> {
    return this.#call('getDevice', {
      userId: String(userId),
      deviceId: String(deviceId),
      timeoutSecs: timeoutSecs ?? null,
    });
  }

  async getUserDevices(userId: unknown, timeoutSecs?: number): Promise<unknown> {
    return this.#call('getUserDevices', {
      userId: String(userId),
      timeoutSecs: timeoutSecs ?? null,
    });
  }

  async getIdentity(userId: unknown): Promise<unknown> {
    return this.#call('getIdentity', { userId: String(userId) });
  }

  async queryKeysForUsers(users: unknown[]): Promise<unknown> {
    return this.#call('queryKeysForUsers', { users: toStringArray(users) });
  }

  async trackedUsers(): Promise<Set<unknown>> {
    const users = (await this.#call('trackedUsers')) as string[];
    return new Set(users.map(idValue));
  }

  async updateTrackedUsers(users: unknown[]): Promise<void> {
    await this.#call('updateTrackedUsers', { users: toStringArray(users) });
  }

  async markAllTrackedUsersAsDirty(): Promise<void> {
    await this.#call('markAllTrackedUsersAsDirty');
  }

  async sign(message: string): Promise<unknown> {
    return this.#call('sign', { message });
  }

  async crossSigningStatus(): Promise<unknown> {
    return this.#call('crossSigningStatus');
  }

  async bootstrapCrossSigning(reset: boolean): Promise<unknown> {
    return this.#call('bootstrapCrossSigning', { reset });
  }

  async exportCrossSigningKeys(): Promise<unknown> {
    return this.#call('exportCrossSigningKeys');
  }

  async importCrossSigningKeys(
    master?: string,
    selfSigning?: string,
    userSigning?: string
  ): Promise<unknown> {
    return this.#call('importCrossSigningKeys', {
      master_key: master ?? null,
      self_signing_key: selfSigning ?? null,
      user_signing_key: userSigning ?? null,
    });
  }

  async pushSecretToVerifiedDevices(secretName: string): Promise<unknown> {
    return this.#call('pushSecretToVerifiedDevices', { secretName });
  }

  async getSecretsFromInbox(secretName: string): Promise<Set<string>> {
    const secrets = (await this.#call('getSecretsFromInbox', {
      secretName,
    })) as string[];
    return new Set(secrets);
  }

  async deleteSecretsFromInbox(secretName: string): Promise<void> {
    await this.#call('deleteSecretsFromInbox', { secretName });
  }

  async getBackupKeys(): Promise<unknown> {
    return this.#call('getBackupKeys');
  }

  async saveBackupDecryptionKey(decryptionKey: unknown, version: string): Promise<void> {
    await this.#call('saveBackupDecryptionKey', {
      decryptionKey: keyToBase64(decryptionKey),
      version,
    });
  }

  async enableBackupV1(publicKeyBase64: string, version: string): Promise<void> {
    await this.#call('enableBackupV1', { publicKeyBase64, version });
  }

  async disableBackup(): Promise<void> {
    await this.#call('disableBackup');
  }

  async isBackupEnabled(): Promise<boolean> {
    return (await this.#call('isBackupEnabled')) as boolean;
  }

  async verifyBackup(backupInfo: unknown): Promise<unknown> {
    return this.#call('verifyBackup', { backupInfo });
  }

  async backupRoomKeys(): Promise<unknown> {
    return this.#call('backupRoomKeys');
  }

  // js-sdk passes nested Maps, which JSON.stringify flattens to `{}`.
  async importBackedUpRoomKeys(
    keysByRoom: unknown,
    progressListener?: (progress: bigint, total: bigint, failures: bigint) => void,
    backupVersion?: string
  ): Promise<unknown> {
    // RoomId keys compare by identity, so merge entries by their string value.
    const keys: Record<string, Record<string, unknown>> = {};
    if (keysByRoom instanceof Map) {
      for (const [roomId, sessions] of keysByRoom) {
        const room = (keys[String(roomId)] ??= {});
        if (sessions instanceof Map) {
          for (const [sessionId, key] of sessions) room[String(sessionId)] = key;
        }
      }
    }

    const result = (await this.#call('importBackedUpRoomKeys', {
      keys,
      backupVersion: backupVersion ?? null,
    })) as { importedCount?: number; totalCount?: number } | null;

    // The engine imports in one shot, so report completion rather than nothing.
    const imported = BigInt(result?.importedCount ?? 0);
    const total = BigInt(result?.totalCount ?? 0);
    progressListener?.(imported, total, total - imported);
    return result;
  }

  async importExportedRoomKeys(keys: unknown): Promise<unknown> {
    return this.#call('importExportedRoomKeys', { keys });
  }

  async exportRoomKeys(): Promise<unknown> {
    return this.#call('exportRoomKeys');
  }

  getVerificationRequest(userId: unknown, flowId: string): unknown {
    const watched = this.#watchedFlows.get(flowId);
    return watched?.userId === String(userId) ? watched.request : undefined;
  }

  getVerificationRequests(userId: unknown): unknown[] {
    const expectedUserId = String(userId);
    return [...this.#watchedFlows.values()]
      .filter((watched) => watched.userId === expectedUserId && watched.request)
      .map((watched) => watched.request);
  }

  async requestDeviceVerification(
    userId: unknown,
    deviceId: unknown,
    methods: number[]
  ): Promise<StartedVerification> {
    return this.#startVerification('device.requestVerification', {
      userId: String(userId),
      deviceId: String(deviceId),
      methods,
    });
  }

  async requestOwnUserVerification(methods: number[]): Promise<StartedVerification> {
    return this.#startVerification('userIdentity.requestVerification', {
      userId: this.#info.userId,
      methods,
    });
  }

  async verificationRequestContent(
    userId: unknown,
    roomId: unknown,
    methods: number[]
  ): Promise<string> {
    const content = (await this.#call('userIdentity.verificationRequestContent', {
      userId: String(userId),
      roomId: String(roomId),
      methods,
    })) as { outgoingRequest?: { body?: unknown } } | null;

    const body = content?.outgoingRequest?.body;
    if (typeof body !== 'string') {
      throw new Error('Rust crypto engine returned no verification request content');
    }
    return body;
  }

  async requestVerificationDm(
    userId: unknown,
    roomId: unknown,
    requestEventId: string,
    methods: number[]
  ): Promise<StartedVerification> {
    return this.#startVerification('userIdentity.requestVerificationDm', {
      userId: String(userId),
      roomId: String(roomId),
      requestEventId,
      methods,
    });
  }

  async #startVerification(
    method: string,
    args: Record<string, unknown>
  ): Promise<StartedVerification> {
    const started = (await this.#call(method, args)) as StartedVerification | null;
    if (!started?.request) {
      throw new Error(`Rust crypto engine returned no verification request from ${method}`);
    }
    return started;
  }

  async getAllRoomsPendingKeyBundles(): Promise<unknown[]> {
    return (await this.#call('getAllRoomsPendingKeyBundles')) as unknown[];
  }

  async storeRoomPendingKeyBundle(roomId: unknown, inviterId: unknown): Promise<void> {
    await this.#call('storeRoomPendingKeyBundle', {
      roomId: String(roomId),
      inviterId: String(inviterId),
    });
  }

  async clearRoomPendingKeyBundle(roomId: unknown): Promise<void> {
    await this.#call('clearRoomPendingKeyBundle', { roomId: String(roomId) });
  }

  async getPendingKeyBundleDetailsForRoom(roomId: unknown): Promise<unknown> {
    return this.#call('getPendingKeyBundleDetailsForRoom', {
      roomId: String(roomId),
    });
  }

  async getReceivedRoomKeyBundleData(roomId: unknown, inviterId: unknown): Promise<unknown> {
    return this.#call('getReceivedRoomKeyBundleData', {
      roomId: String(roomId),
      inviterId: String(inviterId),
    });
  }

  // The engine keys the lookup on room + inviter and takes the bundle as base64.
  async receiveRoomKeyBundle(bundleData: unknown, encryptedBundle: unknown): Promise<void> {
    const data = (bundleData ?? {}) as { roomId?: unknown; senderUser?: unknown };
    await this.#call('receiveRoomKeyBundle', {
      roomId: String(data.roomId),
      inviterId: String(data.senderUser),
      bundle: toBase64(encryptedBundle),
    });
  }

  dehydratedDevices() {
    const call = (method: string, args: Record<string, unknown> = {}) =>
      this.#call(`dehydratedDevices.${method}`, args);
    return {
      // js-sdk calls `(await create()).keysForUpload(...)`; the engine creates the device
      // inside `keysForUpload`, so `create` only has to carry the handle.
      create: async () => ({
        keysForUpload: (initialDeviceDisplayName: string, key: unknown) =>
          call('keysForUpload', {
            initialDeviceDisplayName,
            dehydratedDeviceKey: keyToBase64(key),
          }),
      }),
      rehydrate: async (key: unknown, deviceId: unknown, deviceData: string) => {
        const device = (await call('rehydrate', {
          dehydratedDeviceKey: keyToBase64(key),
          deviceId: String(deviceId),
          deviceData,
        })) as { deviceId: string };
        return {
          ...device,
          receiveEvents: (toDeviceEvents: string) =>
            call('receiveEvents', { deviceId: device.deviceId, toDeviceEvents }),
        };
      },
      getDehydratedDeviceKey: () => call('getDehydratedDeviceKey'),
      saveDehydratedDeviceKey: (key: unknown) =>
        call('saveDehydratedDeviceKey', {
          dehydratedDeviceKey: keyToBase64(key),
        }),
      deleteDehydratedDeviceKey: () => call('deleteDehydratedDeviceKey'),
    };
  }

  registerRoomKeyUpdatedCallback(callback: (sessions: unknown[]) => void): void {
    this.#roomKeyUpdatedCallback = callback;
  }

  registerRoomKeysWithheldCallback(callback: (withheld: unknown[]) => void): void {
    this.#roomKeysWithheldCallback = callback;
  }

  registerUserIdentityUpdatedCallback(callback: (userId: unknown) => void): void {
    this.#userIdentityUpdatedCallback = callback;
  }

  registerDevicesUpdatedCallback(callback: (userIds: string[]) => void): void {
    this.#devicesUpdatedCallback = callback;
  }

  registerReceiveSecretCallback(callback: (name: string, value: string) => void): void {
    this.#receiveSecretCallback = callback;
  }

  readonly emit = {
    roomKeysUpdated: (sessions: unknown[]) => this.#roomKeyUpdatedCallback?.(sessions),
    roomKeysWithheld: (withheld: unknown[]) => this.#roomKeysWithheldCallback?.(withheld),
    userIdentityUpdated: (userId: string) =>
      this.#userIdentityUpdatedCallback?.(new RustSdkCryptoJs.UserId(userId)),
    devicesUpdated: (userIds: string[]) => this.#devicesUpdatedCallback?.(userIds),
    secretReceived: (name: string, value: string) => this.#receiveSecretCallback?.(name, value),
    verificationChanged: (flowId: string) =>
      this.#changesCallbacks.get(flowId)?.forEach((callback) => callback()),
  };
}

const toStringArray = (value: unknown): string[] => {
  if (!value) return [];
  const items = value instanceof Set ? [...value] : Array.isArray(value) ? value : [value];
  return items.map(String);
};

const toRecord = (value: Map<string, number> | Record<string, number>): Record<string, number> =>
  value instanceof Map ? Object.fromEntries(value) : value;

const defineMethodField = (record: Record<string, unknown>, name: string, value: unknown): void => {
  Object.defineProperty(record, name, {
    value: () => value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};

const SAS_OPTIONAL_FIELDS = new Set(['cancelInfo', 'decimals', 'emoji', 'emojiIndex']);

const patchSnapshot = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  skip: string[]
): void => {
  for (const [key, value] of Object.entries(source)) {
    if (skip.includes(key) || key === 'verification' || key === 'getVerification') continue;
    if (typeof value === 'function') continue;
    const normalized =
      value === null && target instanceof RustSdkCryptoJs.Sas && SAS_OPTIONAL_FIELDS.has(key)
        ? undefined
        : value;
    Object.defineProperty(target, key, {
      value: typeof target[key] === 'function' ? () => normalized : normalized,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
};
