import { createDebugLogger } from '$utils/debugLogger';
import { graftWasmPrototypes, RustSdkCryptoJs } from './wasmClasses';
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

const idValue = (id: string) => ({
  toString: () => id,
  localpart: () => id.replace(/^@/, '').split(':')[0],
});

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

  readonly #hydration: HydrationContext = {
    call: (method, args) => this.#call(method, args),
    queueOutgoing: (label, pending) => {
      void pending.then(
        (request) => {
          if (request) this.#pending.push(request as { id?: unknown });
        },
        (error) => proxyLog.error('error', `Rust crypto engine failed on ${label}`, error)
      );
    },
    watchChanges: (flowId, callback) => {
      const callbacks = this.#changesCallbacks.get(flowId) ?? new Set();
      callbacks.add(callback);
      this.#changesCallbacks.set(flowId, callbacks);
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
    return graftWasmPrototypes(await engineInvoke(this.#identity, method, args), this.#hydration);
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
    this.#closed = true;
  }

  free(): void {
    this.#closed = true;
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
    return this.#call('decryptRoomEvent', {
      event,
      roomId: String(roomId),
      decryptionSettings: rest.at(-1) ?? null,
    });
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
      encryptionSettings,
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
    await this.#call('setRoomSettings', { roomId: String(roomId), settings });
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
      decryptionKey: String(decryptionKey),
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

  async importBackedUpRoomKeys(keys: unknown, backupVersion?: string): Promise<unknown> {
    return this.#call('importBackedUpRoomKeys', {
      keys,
      backupVersion: backupVersion ?? null,
    });
  }

  async importExportedRoomKeys(keys: unknown): Promise<unknown> {
    return this.#call('importExportedRoomKeys', { keys });
  }

  async exportRoomKeys(): Promise<unknown> {
    return this.#call('exportRoomKeys');
  }

  async getVerificationRequest(userId: unknown, flowId: string): Promise<unknown> {
    return this.#call('getVerificationRequest', {
      userId: String(userId),
      flowId,
    });
  }

  async getVerificationRequests(userId: unknown): Promise<unknown[]> {
    return (await this.#call('getVerificationRequests', {
      userId: String(userId),
    })) as unknown[];
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

  async receiveRoomKeyBundle(roomId: unknown, bundle: unknown): Promise<void> {
    await this.#call('receiveRoomKeyBundle', {
      roomId: String(roomId),
      bundle,
    });
  }

  dehydratedDevices() {
    const call = (method: string, args: Record<string, unknown> = {}) =>
      this.#call(`dehydratedDevices.${method}`, args);
    return {
      create: () => call('create'),
      keysForUpload: (deviceDisplayName: string, key: unknown) =>
        call('keysForUpload', { deviceDisplayName, key: String(key) }),
      rehydrate: (key: unknown, deviceId: unknown, deviceData: string) =>
        call('rehydrate', {
          key: String(key),
          deviceId: String(deviceId),
          deviceData,
        }),
      getDehydratedDeviceKey: () => call('getDehydratedDeviceKey'),
      saveDehydratedDeviceKey: (key: unknown) => call('saveDehydratedDeviceKey', {
        key: String(key),
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
