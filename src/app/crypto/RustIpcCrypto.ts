import type { IMegolmSessionData } from 'matrix-js-sdk/lib/@types/crypto';
import type {
  IDeviceLists,
  IToDeviceEvent,
  MatrixClient,
  MatrixEvent,
  ReceivedToDeviceMessage,
  Room,
} from '$types/matrix-sdk';
import { DeviceVerificationStatus, UserVerificationStatus } from '$types/matrix-sdk';
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import { createDebugLogger } from '$utils/debugLogger';
import * as engine from './engineClient';
import type { EngineInfo } from './engineClient';

const cryptoLog = createDebugLogger('rust-crypto-ipc');

/**
 * Thrown by every part of the crypto surface the IPC engine does not implement
 * yet, so a missing piece surfaces as a named failure instead of `undefined is
 * not a function` somewhere deep in matrix-js-sdk.
 */
export class CryptoNotImplementedError extends Error {
  constructor(member: string) {
    super(`RustIpcCrypto does not implement ${member} yet`);
    this.name = 'CryptoNotImplementedError';
  }
}

function notImplemented(member: string): never {
  throw new CryptoNotImplementedError(member);
}

type EngineIdentity = {
  userId: string;
  deviceId: string;
};

/** Curve25519/Ed25519 identity of this device, as reported by `engine_open`. */
type EngineDeviceKeys = {
  curve25519Key: string;
  ed25519Key: string;
};

/**
 * Drives matrix-js-sdk's crypto duties from the Rust engine over Tauri IPC.
 *
 * matrix-js-sdk has no seam for swapping crypto implementations —
 * `initRustCrypto` hardcodes the wasm import and assigns the private
 * `cryptoBackend` field — so this class replicates the role of that class's
 * instance and is installed by assigning the same field. `getCrypto()` reads it
 * too, which is why one assignment is enough.
 *
 * Implemented so far: the event path (encrypt/decrypt) and the sync feed, which
 * is what the notification pipeline needs. The rest of `CryptoApi` throws
 * {@link CryptoNotImplementedError}.
 */
export class RustIpcCrypto {
  globalErrorOnUnknownDevices = false;

  globalBlacklistUnverifiedDevices = false;

  #mx: MatrixClient;

  #identity: EngineIdentity;

  #deviceKeys: EngineDeviceKeys;

  #stopped = false;

  #trustCrossSignedDevices = true;

  /** Serialises the request pump so two sync cycles cannot run it at once. */
  #pump: Promise<void> = Promise.resolve();

  constructor(mx: MatrixClient, info: EngineInfo) {
    this.#mx = mx;
    this.#identity = { userId: info.user_id, deviceId: info.device_id };
    this.#deviceKeys = {
      curve25519Key: info.curve25519_key,
      ed25519Key: info.ed25519_key,
    };
  }

  stop(): void {
    this.#stopped = true;
    void engine.close(this.#identity).catch(() => {
      // Closing is best effort; the engine drops the machine on process exit.
    });
  }

  // ------------------------------------------------------------- event path

  async encryptEvent(event: MatrixEvent, room: Room): Promise<void> {
    const content = await engine.encryptEvent({
      ...this.#identity,
      roomId: room.roomId,
      eventType: event.getType(),
      contentJson: JSON.stringify(event.getContent()),
    });
    event.makeEncrypted(
      EventType.RoomMessageEncrypted,
      content,
      this.#deviceKeys.curve25519Key,
      this.#deviceKeys.ed25519Key
    );
  }

  async decryptEvent(event: MatrixEvent): Promise<engine.DecryptionResult> {
    const roomId = event.getRoomId();
    if (!roomId) throw new Error('Cannot decrypt an event with no room id');
    return engine.decryptEvent({
      ...this.#identity,
      roomId,
      eventJson: JSON.stringify(event.getEffectiveEvent()),
    });
  }

  // -------------------------------------------------------------- sync feed

  async preprocessToDeviceMessages(events: IToDeviceEvent[]): Promise<ReceivedToDeviceMessage[]> {
    const processed = await this.#receiveSyncChanges({ toDeviceEvents: events });
    return processed.map((message) => ({ message, encryptionInfo: null }));
  }

  async processDeviceLists(deviceLists: IDeviceLists): Promise<void> {
    await this.#receiveSyncChanges({
      changedDevices: deviceLists.changed ?? [],
      leftDevices: deviceLists.left ?? [],
    });
  }

  async processKeyCounts(
    oneTimeKeysCounts?: Record<string, number>,
    unusedFallbackKeys?: string[]
  ): Promise<void> {
    await this.#receiveSyncChanges({
      oneTimeKeysCounts: oneTimeKeysCounts ?? {},
      unusedFallbackKeys,
    });
  }

  async markAllTrackedUsersAsDirty(): Promise<void> {
    notImplemented('markAllTrackedUsersAsDirty');
  }

  async onCryptoEvent(): Promise<void> {
    // The engine reads m.room.encryption state from the event it is asked to
    // encrypt, so there is nothing to prime here.
  }

  onSyncCompleted(): void {
    this.#schedulePump();
  }

  async #receiveSyncChanges(changes: {
    toDeviceEvents?: IToDeviceEvent[];
    changedDevices?: string[];
    leftDevices?: string[];
    oneTimeKeysCounts?: Record<string, number>;
    unusedFallbackKeys?: string[];
  }): Promise<IToDeviceEvent[]> {
    if (this.#stopped) return [];
    const result = await engine.receiveSyncChanges({
      ...this.#identity,
      request: {
        to_device_events: (changes.toDeviceEvents ?? []).map((event) => JSON.stringify(event)),
        changed_devices: changes.changedDevices ?? [],
        left_devices: changes.leftDevices ?? [],
        one_time_keys_counts: changes.oneTimeKeysCounts ?? {},
        unused_fallback_keys: changes.unusedFallbackKeys ?? null,
        next_batch_token: null,
      },
    });
    this.#schedulePump();
    return result.to_device_events.map((event: string) => JSON.parse(event) as IToDeviceEvent);
  }

  // ----------------------------------------------------------- request pump

  /**
   * The engine queues the HTTP it needs (key uploads, /keys/query, to-device
   * sends) rather than owning a client, mirroring how js-sdk's
   * OutgoingRequestProcessor drains wasm crypto. Runs detached: sync must not
   * block on key traffic.
   */
  #schedulePump(): void {
    if (this.#stopped) return;
    this.#pump = this.#pump.then(
      () => this.#drainOutgoingRequests(),
      () => this.#drainOutgoingRequests()
    );
  }

  async #drainOutgoingRequests(): Promise<void> {
    if (this.#stopped) return;
    let requests: engine.OutgoingCryptoRequest[];
    try {
      requests = await engine.outgoingRequests(this.#identity);
    } catch (error) {
      cryptoLog.warn(
        'general',
        'Fetching outgoing crypto requests failed',
        error instanceof Error ? error : new Error(String(error))
      );
      return;
    }

    for (const request of requests) {
      if (this.#stopped) return;
      try {
        // Sequential on purpose: the engine expects each request to be marked
        // sent before the next batch is derived from it.
        // eslint-disable-next-line no-await-in-loop
        const responseBody = await engine.sendOutgoingRequest(this.#mx, request);
        // eslint-disable-next-line no-await-in-loop
        await engine.markRequestSent({
          ...this.#identity,
          requestId: request.request_id,
          kind: request.kind,
          responseBody,
        });
      } catch (error) {
        cryptoLog.warn(
          'general',
          `Outgoing crypto request ${request.kind} failed`,
          error instanceof Error ? error : new Error(String(error))
        );
        return;
      }
    }
  }

  // ------------------------------------------------- identities and trust

  async getOwnDeviceKeys(): Promise<{ ed25519: string; curve25519: string }> {
    return {
      ed25519: this.#deviceKeys.ed25519Key,
      curve25519: this.#deviceKeys.curve25519Key,
    };
  }

  async getDeviceVerificationStatus(
    userId: string,
    deviceId: string
  ): Promise<DeviceVerificationStatus | null> {
    const trust = await engine.deviceTrust({
      ...this.#identity,
      targetUserId: userId,
      targetDeviceId: deviceId,
    });
    if (!trust.found) return null;
    return new DeviceVerificationStatus({
      signedByOwner: trust.signed_by_owner,
      crossSigningVerified: trust.cross_signing_verified,
      localVerified: trust.local_verified,
      trustCrossSignedDevices: this.#trustCrossSignedDevices,
    });
  }

  async getUserVerificationStatus(userId: string): Promise<UserVerificationStatus> {
    const trust = await engine.userTrust({ ...this.#identity, targetUserId: userId });
    return new UserVerificationStatus(
      trust.cross_signing_verified,
      trust.cross_signing_verified_before,
      trust.known,
      trust.needs_user_approval
    );
  }

  async getCrossSigningStatus(): Promise<{
    publicKeysOnDevice: boolean;
    privateKeysInSecretStorage: boolean;
    privateKeysCachedLocally: {
      masterKey: boolean;
      selfSigningKey: boolean;
      userSigningKey: boolean;
    };
  }> {
    const status = await engine.crossSigningStatus(this.#identity);
    return {
      // Both require account-data reads the engine does not do yet; Phase 1c
      // fills these in with the 4S work rather than guessing here.
      publicKeysOnDevice: false,
      privateKeysInSecretStorage: false,
      privateKeysCachedLocally: {
        masterKey: status.master_key,
        selfSigningKey: status.self_signing_key,
        userSigningKey: status.user_signing_key,
      },
    };
  }

  async isCrossSigningReady(): Promise<boolean> {
    const status = await engine.crossSigningStatus(this.#identity);
    return status.master_key && status.self_signing_key && status.user_signing_key;
  }

  setTrustCrossSignedDevices(val: boolean): void {
    this.#trustCrossSignedDevices = val;
  }

  getTrustCrossSignedDevices(): boolean {
    return this.#trustCrossSignedDevices;
  }

  // -------------------------------------------------------- room key transfer

  async exportRoomKeys(): Promise<IMegolmSessionData[]> {
    const keys = await engine.exportRoomKeys(this.#identity);
    return keys as IMegolmSessionData[];
  }

  async exportRoomKeysAsJson(): Promise<string> {
    return JSON.stringify(await this.exportRoomKeys());
  }

  /** Exports one room's sessions, which `exportRoomKeys` cannot narrow to. */
  async exportRoomKeysForRoom(roomId: string): Promise<IMegolmSessionData[]> {
    const keys = await engine.exportRoomKeys({ ...this.#identity, roomId });
    return keys as IMegolmSessionData[];
  }

  async importRoomKeys(keys: IMegolmSessionData[]): Promise<void> {
    await engine.importRoomKeys({ ...this.#identity, keys });
  }

  async importRoomKeysAsJson(json: string): Promise<void> {
    await this.importRoomKeys(JSON.parse(json) as IMegolmSessionData[]);
  }

  // ------------------------------------------------- not implemented (yet)

  getBackupDecryptor(): never {
    return notImplemented('getBackupDecryptor');
  }

  importBackedUpRoomKeys(): never {
    return notImplemented('importBackedUpRoomKeys');
  }

  shareRoomHistoryWithUser(): never {
    return notImplemented('shareRoomHistoryWithUser');
  }

  maybeAcceptKeyBundle(): never {
    return notImplemented('maybeAcceptKeyBundle');
  }

  markRoomAsPendingKeyBundle(): never {
    return notImplemented('markRoomAsPendingKeyBundle');
  }
}
