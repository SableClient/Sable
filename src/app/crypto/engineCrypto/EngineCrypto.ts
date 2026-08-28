import {
  CrossSigningKey,
  DeviceVerificationStatus,
  deriveRecoveryKeyFromPassphrase,
  EventShieldColour,
  EventShieldReason,
  encodeRecoveryKey,
  EventType,
  ImportRoomKeyStage,
  KnownMembership,
  MatrixEventEvent,
  MsgType,
  UserVerificationStatus,
  VerificationMethod,
} from '$types/matrix-sdk';
import { isVerificationEvent } from 'matrix-js-sdk/lib/rust-crypto/verification';
import { Device, DeviceVerification } from 'matrix-js-sdk/lib/models/device';
import { getHttpUriForMxc } from 'matrix-js-sdk/lib/content-repo';
import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';
import { decodeBase64, encodeBase64 } from 'matrix-js-sdk/lib/base64';
import { secureRandomString } from 'matrix-js-sdk/lib/randomstring';
import type { KeyBackupSession } from 'matrix-js-sdk/lib/crypto-api/keybackup';
import {
  SECRET_STORAGE_ALGORITHM_V1_AES,
  type SecretStorageKey,
} from 'matrix-js-sdk/lib/secret-storage';
import { ClientPrefix, Method } from 'matrix-js-sdk/lib/http-api';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/types';
import { encodeUri } from 'matrix-js-sdk/lib/utils';
import { TypedEventEmitter } from 'matrix-js-sdk/lib/models/typed-event-emitter';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import type { CryptoEventHandlerMap } from 'matrix-js-sdk/lib/crypto-api/CryptoEventHandlerMap';
import { createDebugLogger } from '$utils/debugLogger';
import { EngineVerificationRequest } from '../verification/request';
import { codeFromMethod, type EngineVerificationState } from '../verification/state';
import { engineInvoke, type EngineIdentity } from '../olmMachine/engineInvoke';
import { sendOutgoingRequest, type OutgoingRequest } from './outgoing';
import type {
  BackupDecryptor,
  CryptoBackend,
  EventDecryptionResult,
  OnSyncCompletedData,
} from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import type { DeviceMap } from 'matrix-js-sdk/lib/models/device';
import type {
  IDeviceLists,
  IToDeviceEvent,
  ReceivedToDeviceMessage,
} from 'matrix-js-sdk/lib/sync-accumulator';
import type { IMegolmSessionData } from 'matrix-js-sdk/lib/@types/crypto';
import type { ToDeviceBatch, ToDevicePayload } from 'matrix-js-sdk/lib/models/ToDeviceMessage';
import type { UIAuthCallback } from 'matrix-js-sdk/lib/interactive-auth';
import type {
  BackupTrustInfo,
  BootstrapCrossSigningOpts,
  CreateSecretStorageOpts,
  CrossSigningKeys,
  CrossSigningKeyInfo,
  CrossSigningStatus,
  DeviceIsolationMode,
  EventEncryptionInfo,
  GeneratedSecretStorageKey,
  ImportRoomKeysOpts,
  KeyBackupCheck,
  KeyBackupInfo,
  KeyBackupRestoreOpts,
  KeyBackupRestoreResult,
  MatrixClient,
  MatrixEvent,
  OwnDeviceKeys,
  Room,
  RoomMember,
  SecretStorageStatus,
  StartDehydrationOpts,
  VerificationRequest,
} from '$types/matrix-sdk';

const engineCryptoLog = createDebugLogger('engine-crypto');

const DECRYPTION_WAIT_MS = 5 * 60 * 1000;

/** js-sdk keeps this union private to its own rust-crypto module; derived the same way. */
type CryptoEvents = (typeof CryptoEvent)[keyof typeof CryptoEvent];

/** Matches matrix-js-sdk's own derivation cost so keys stay interchangeable. */
const RECOVERY_KEY_DERIVATION_ITERATIONS = 500000;

const SECRETS_IN_STORAGE = [
  'm.cross_signing.master',
  'm.cross_signing.self_signing',
  'm.cross_signing.user_signing',
] as const satisfies readonly SecretStorageKey[];

const SUPPORTED_VERIFICATION_METHOD_CODES = [
  VerificationMethod.Sas,
  VerificationMethod.ScanQrCode,
  VerificationMethod.ShowQrCode,
  VerificationMethod.Reciprocate,
]
  .map(codeFromMethod)
  .filter((code): code is number => code !== undefined);

type EngineDevice = {
  userId: string;
  deviceId: string;
  displayName?: string | null;
  algorithms: number[];
  keys: Record<string, string>;
  isCrossSigningTrusted: boolean;
  isCrossSignedByOwner: boolean;
  isLocallyTrusted: boolean;
  isDehydrated: boolean;
};

/** wasm's ProcessedToDeviceEventType, which the engine emits as bare numbers. */
const ProcessedToDeviceEventType = {
  Decrypted: 0,
  UnableToDecrypt: 1,
  PlainText: 2,
  Invalid: 3,
} as const;

type EngineProcessedToDeviceEvent = {
  type: number;
  rawEvent: string;
  encryptionInfo?: {
    sender: string;
    senderDevice?: string;
    senderCurve25519Key: string;
    isSenderVerified: boolean;
  };
};

type EngineShieldState = { color: number; code?: number | null };

type EngineEncryptionInfo = {
  shieldStateLax?: EngineShieldState;
  shieldStateStrict?: EngineShieldState;
};

// Engine colour codes, per shield_state_json in matrix_crypto/rooms.rs.
const SHIELD_COLOUR: Record<number, EventShieldColour> = {
  0: EventShieldColour.RED,
  1: EventShieldColour.GREY,
  2: EventShieldColour.NONE,
};

// Engine ShieldStateCode ordinals, per shield_state_json in matrix_crypto/rooms.rs.
const SHIELD_REASON: Record<number, EventShieldReason> = {
  0: EventShieldReason.AUTHENTICITY_NOT_GUARANTEED,
  1: EventShieldReason.UNKNOWN_DEVICE,
  2: EventShieldReason.UNSIGNED_DEVICE,
  3: EventShieldReason.UNVERIFIED_IDENTITY,
  4: EventShieldReason.VERIFICATION_VIOLATION,
  5: EventShieldReason.MISMATCHED_SENDER,
};

export const toEventEncryptionInfo = (
  info: EngineEncryptionInfo | null
): EventEncryptionInfo | null => {
  if (!info) return null;

  // js-sdk reads the lax state; strict is only used behind its own setting.
  const state = info.shieldStateLax;
  if (!state) return null;

  const code = state.code;
  return {
    shieldColour: SHIELD_COLOUR[state.color] ?? EventShieldColour.RED,
    shieldReason:
      code === undefined || code === null
        ? null
        : (SHIELD_REASON[code] ?? EventShieldReason.UNKNOWN),
  };
};

type EngineDecryptedEvent = {
  event: string;
  senderCurve25519Key?: string | null;
  senderClaimedEd25519Key?: string | null;
  forwardingCurve25519KeyChain?: string[];
};

const isOutgoingRequest = (value: unknown): value is OutgoingRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OutgoingRequest>;
  return typeof candidate.type === 'number' && typeof candidate.body === 'string';
};

type EngineRoomKeyBundle = {
  encryptedData: string;
  mediaEncryptionInfo: string;
};

type EngineBackupKeys = {
  backupVersion?: string | null;
  /** Base64 text, not raw bytes; the engine never hands the key over as an object. */
  decryptionKeyBase64?: string | null;
};

/** The engine serialises each cross-signing key as JSON text. */
const parseCrossSigningKey = (raw: unknown): CrossSigningKeyInfo | undefined => {
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw) as CrossSigningKeyInfo;
  } catch {
    return undefined;
  }
};

type EngineIdentityInfo = {
  userId: string;
  isVerified: boolean;
  wasPreviouslyVerified: boolean;
  identityNeedsUserApproval?: boolean;
  masterKey?: unknown;
  selfSigningKey?: unknown;
  userSigningKey?: unknown;
};

const toSdkDevice = (device: EngineDevice): Device =>
  new Device({
    userId: device.userId,
    deviceId: device.deviceId,
    displayName: device.displayName ?? undefined,
    algorithms: [],
    keys: new Map(Object.entries(device.keys)),
    verified: device.isLocallyTrusted ? DeviceVerification.Verified : DeviceVerification.Unverified,
    signatures: new Map(),
    dehydrated: device.isDehydrated,
  });

export class EngineCrypto
  extends TypedEventEmitter<CryptoEvents, CryptoEventHandlerMap>
  implements CryptoBackend
{
  globalBlacklistUnverifiedDevices = false;

  globalErrorOnUnknownDevices = false;

  readonly #mx: MatrixClient;

  readonly #identity: EngineIdentity;

  #trustCrossSignedDevices = true;

  #stopped = false;

  #deviceIsolationMode: DeviceIsolationMode | undefined;

  /** Live requests, keyed by flow id, so the synchronous CryptoApi getters can answer. */
  readonly #verificationRequests = new Map<string, EngineVerificationRequest>();

  #flushing: Promise<void> = Promise.resolve();

  constructor(mx: MatrixClient, identity: EngineIdentity) {
    super();
    this.#mx = mx;
    this.#identity = identity;
    // Nothing else drives the backup connection.
    void this.#connectKeyBackup();
  }

  /** The engine reports a backup version only once `enableBackupV1` has run. */
  async #connectKeyBackup(): Promise<void> {
    try {
      await this.checkKeyBackupAndEnable();
      this.emit(CryptoEvent.KeyBackupStatus, (await this.getActiveSessionBackupVersion()) !== null);
    } catch {
      // Backup is optional; failing here must not break the session.
    }
  }

  onUserIdentityUpdated(userId: string): void {
    this.emit(
      CryptoEvent.UserTrustStatusChanged,
      userId,
      new UserVerificationStatus(false, false, true)
    );
    // Our own identity becoming trusted can make a backup we rejected trustworthy.
    if (userId === this.#identity.userId) void this.#connectKeyBackup();
  }

  onDevicesUpdated(userIds: string[]): void {
    this.emit(CryptoEvent.DevicesUpdated, userIds, false);
  }

  onKeysChanged(): void {
    this.emit(CryptoEvent.KeysChanged, {});
  }

  async #receiveSyncChanges(input: {
    toDeviceEvents?: IToDeviceEvent[];
    deviceLists?: IDeviceLists;
    oneTimeKeysCounts?: Record<string, number>;
    unusedFallbackKeys?: string[];
  }): Promise<EngineProcessedToDeviceEvent[]> {
    const processed = (await this.#call('receiveSyncChanges', {
      toDeviceEvents: JSON.stringify(input.toDeviceEvents ?? []),
      changedDevices: input.deviceLists?.changed ?? [],
      leftDevices: input.deviceLists?.left ?? [],
      oneTimeKeysCounts: input.oneTimeKeysCounts ?? {},
      unusedFallbackKeys: input.unusedFallbackKeys ?? null,
    })) as EngineProcessedToDeviceEvent[] | null;

    void this.#flushOutgoingRequests();
    return processed ?? [];
  }

  #call(method: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return engineInvoke(this.#identity, method, args);
  }

  /**
   * Verification actions return their outgoing request instead of queueing it, so the
   * generic drain never sees it. Unsent, the flow stalls with no error.
   */
  readonly #engineCall = async (
    method: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> => {
    const result = await this.#call(method, args);

    // `sas.confirm` answers with several requests (the MAC plus a signature upload), and
    // `startSas` answers with [state, request]. Sending only a lone object drops both.
    if (Array.isArray(result)) {
      for (const item of result) {
        if (!isOutgoingRequest(item)) continue;
        // Ordered: the peer rejects a MAC that arrives before the accept.
        // eslint-disable-next-line no-await-in-loop
        await sendOutgoingRequest(this.#mx, item);
      }
      return result;
    }

    if (isOutgoingRequest(result)) {
      await sendOutgoingRequest(this.#mx, result);
      return null;
    }
    return result;
  };

  async #startVerification(
    method: string,
    args: Record<string, unknown>
  ): Promise<VerificationRequest> {
    const started = (await this.#call(method, args)) as {
      request: EngineVerificationState;
      outgoingRequest?: unknown;
    };
    if (isOutgoingRequest(started.outgoingRequest)) {
      await sendOutgoingRequest(this.#mx, started.outgoingRequest);
    }
    await this.#flushOutgoingRequests();

    const request = new EngineVerificationRequest(this.#engineCall, started.request);
    this.#verificationRequests.set(started.request.flowId, request);
    return request;
  }

  async onLiveEventFromSync(event: MatrixEvent): Promise<void> {
    if (event.isState() || event.getUnsigned().transaction_id) return;

    const handle = async (candidate: MatrixEvent): Promise<void> => {
      if (isVerificationEvent(candidate)) await this.onKeyVerificationEvent(candidate);
    };

    if (event.isDecryptionFailure() || event.isEncrypted()) {
      let timeoutId: ReturnType<typeof setTimeout>;
      const onDecrypted = (decrypted: MatrixEvent, error?: Error) => {
        if (error) return;
        clearTimeout(timeoutId);
        event.off(MatrixEventEvent.Decrypted, onDecrypted);
        void handle(decrypted);
      };
      timeoutId = setTimeout(() => {
        event.off(MatrixEventEvent.Decrypted, onDecrypted);
      }, DECRYPTION_WAIT_MS);
      event.on(MatrixEventEvent.Decrypted, onDecrypted);
      return;
    }

    await handle(event);
  }

  async onKeyVerificationEvent(event: MatrixEvent): Promise<void> {
    const roomId = event.getRoomId();
    const senderId = event.getSender();
    const eventId = event.getId();
    if (!roomId || !senderId || !eventId) return;

    const content = event.getContent();
    const isRequest =
      event.getType() === EventType.RoomMessage &&
      content.msgtype === MsgType.KeyVerificationRequest;

    if (isRequest) {
      await this.#sendTracked(await this.#call('queryKeysForUsers', { users: [senderId] }));
    }

    await this.#call('receiveVerificationEvent', {
      roomId,
      event: JSON.stringify({
        event_id: eventId,
        type: event.getType(),
        sender: senderId,
        state_key: event.getStateKey(),
        content,
        origin_server_ts: event.getTs(),
      }),
    });

    if (isRequest) {
      await this.onIncomingKeyVerificationRequest(senderId, eventId);
    } else {
      const flowId = (content['m.relates_to'] as { event_id?: string } | undefined)?.event_id;
      if (flowId) await this.#verificationRequests.get(flowId)?.refresh();
    }

    await this.#flushOutgoingRequests();
  }

  onRoomStateEvent(event: MatrixEvent): void {
    if (event.getType() !== EventType.RoomMember) return;
    if (
      event.getStateKey() !== this.#identity.userId &&
      event.getContent().membership !== KnownMembership.Join
    ) {
      void this.forceDiscardSession(event.getRoomId() ?? '');
    }
  }

  onRoomMembership(event: MatrixEvent, member: RoomMember, oldMembership?: string): void {
    const roomId = event.getRoomId();
    if (!roomId) return;
    if (
      oldMembership === KnownMembership.Join &&
      member.membership !== KnownMembership.Join &&
      member.userId === this.#identity.userId
    ) {
      void this.#call('clearRoomPendingKeyBundle', { roomId });
    }
  }

  async #sendTracked(request: unknown): Promise<void> {
    if (!isOutgoingRequest(request)) return;
    const response = await sendOutgoingRequest(this.#mx, request);
    await this.#call('markRequestAsSent', {
      requestId: request.id,
      requestType: request.type,
      response,
    });
  }

  async onIncomingKeyVerificationRequest(sender: string, transactionId: string): Promise<void> {
    const state = (await this.#call('getVerificationRequest', {
      userId: sender,
      flowId: transactionId,
    })) as EngineVerificationState | null;
    if (!state) return;

    const existing = this.#verificationRequests.get(transactionId);
    if (existing) {
      existing.apply(state);
      return;
    }
    const request = new EngineVerificationRequest(this.#engineCall, state);
    this.#verificationRequests.set(transactionId, request);
    this.emit(CryptoEvent.VerificationRequestReceived, request);
  }

  #flushOutgoingRequests(): Promise<void> {
    this.#flushing = this.#flushing.then(() =>
      this.#drainOutgoingRequests().catch((error: unknown) => {
        engineCryptoLog.error('general', 'Draining outgoing crypto requests failed', error);
      })
    );
    return this.#flushing;
  }

  /** matrix-sdk-crypto only clears a request once told it was sent, so a failure here
   * leaves it queued for the next drain rather than losing it. */
  async #drainOutgoingRequests(): Promise<void> {
    if (this.#stopped) return;
    const requests = ((await this.#call('outgoingRequests')) ?? []) as OutgoingRequest[];

    for (const request of requests) {
      if (this.#stopped) return;
      try {
        // Sequential: the engine's queue is ordered and later requests can depend on
        // earlier ones having landed.
        // eslint-disable-next-line no-await-in-loop
        const response = await sendOutgoingRequest(this.#mx, request);
        // eslint-disable-next-line no-await-in-loop
        await this.#call('markRequestAsSent', {
          requestId: request.id,
          requestType: request.type,
          response,
        });
      } catch (error) {
        // Loud: a request the engine never marks sent is retried on every sync forever.
        engineCryptoLog.error('general', `Outgoing crypto request ${request.id} failed`, error);
      }
    }
  }

  async preprocessToDeviceMessages(events: IToDeviceEvent[]): Promise<ReceivedToDeviceMessage[]> {
    const processed = await this.#receiveSyncChanges({ toDeviceEvents: events });
    const received: ReceivedToDeviceMessage[] = [];

    const messages = processed.map(
      (event) => [event, JSON.parse(event.rawEvent) as IToDeviceEvent] as const
    );

    if (
      messages.some(
        ([, message]) =>
          typeof message.type === 'string' && message.type.startsWith('m.key.verification.')
      )
    ) {
      await this.#flushOutgoingRequests();
    }

    for (const [event, message] of messages) {
      if (typeof message.type === 'string' && message.type.startsWith('m.key.verification.')) {
        const transactionId = (message.content as { transaction_id?: string })?.transaction_id;
        if (transactionId && message.sender) {
          if (message.type === EventType.KeyVerificationRequest) {
            // eslint-disable-next-line no-await-in-loop
            await this.onIncomingKeyVerificationRequest(message.sender, transactionId);
          } else if (message.type === EventType.KeyVerificationDone) {
            // Rust removes completed requests while consuming the event, so no state snapshot
            // exists to refresh. Keep the JS request alive long enough to expose Done.
            this.#verificationRequests.get(transactionId)?.markDone();
          } else {
            // Without this the verifier never learns the SAS digits arrived.
            // eslint-disable-next-line no-await-in-loop
            await this.#verificationRequests.get(transactionId)?.refresh();
          }
        }
      }

      if (event.type === ProcessedToDeviceEventType.Decrypted && event.encryptionInfo) {
        received.push({
          message,
          encryptionInfo: {
            sender: event.encryptionInfo.sender,
            senderDevice: event.encryptionInfo.senderDevice,
            senderCurve25519KeyBase64: event.encryptionInfo.senderCurve25519Key,
            senderVerified: event.encryptionInfo.isSenderVerified,
          },
        });
      } else if (event.type === ProcessedToDeviceEventType.PlainText) {
        received.push({ message, encryptionInfo: null });
      }
      // Undecryptable and invalid events are dropped, as js-sdk's own backend does.
    }

    return received;
  }

  async processKeyCounts(
    oneTimeKeysCounts?: Record<string, number>,
    unusedFallbackKeys?: string[]
  ): Promise<void> {
    await this.#receiveSyncChanges({ oneTimeKeysCounts, unusedFallbackKeys });
  }

  async processDeviceLists(deviceLists: IDeviceLists): Promise<void> {
    await this.#receiveSyncChanges({ deviceLists });
  }

  async onCryptoEvent(room: Room, event: MatrixEvent): Promise<void> {
    const config = event.getContent();
    if (config.algorithm !== 'm.megolm.v1.aes-sha2') {
      engineCryptoLog.warn('general', 'Ignoring encryption event with invalid algorithm', {
        roomId: room.roomId,
        algorithm: config.algorithm,
      });
      return;
    }

    await this.#call('setRoomSettings', {
      roomId: room.roomId,
      settings: {
        algorithm: config.algorithm,
        sessionRotationPeriodMs: config.rotation_period_ms,
        sessionRotationPeriodMessages: config.rotation_period_msgs,
      },
    });
  }

  onSyncCompleted(syncState: OnSyncCompletedData): void {
    // Working through a backlog: the next sync follows immediately, so batch the drain.
    if (syncState.catchingUp) return;
    void this.#flushOutgoingRequests();
  }

  async markAllTrackedUsersAsDirty(): Promise<void> {
    await this.#call('markAllTrackedUsersAsDirty');
  }

  stop(): void {
    this.#stopped = true;
  }

  async encryptEvent(event: MatrixEvent, room: Room): Promise<void> {
    // The megolm session has to reach every device in the room before the event does.
    const members = await room.getEncryptionTargetMembers();
    await this.#call('getMissingSessions', { users: members.map((member) => member.userId) });
    await this.#flushOutgoingRequests();
    await this.#call('shareRoomKey', { roomId: room.roomId, users: members.map((m) => m.userId) });
    await this.#flushOutgoingRequests();

    const encrypted = (await this.#call('encryptRoomEvent', {
      roomId: room.roomId,
      eventType: event.getType(),
      content: JSON.stringify(event.getContent()),
    })) as string;

    event.makeEncrypted(
      'm.room.encrypted',
      JSON.parse(encrypted) as Record<string, unknown>,
      '',
      ''
    );
  }

  async decryptEvent(event: MatrixEvent): Promise<EventDecryptionResult> {
    const roomId = event.getRoomId();
    if (!roomId) throw new Error('Cannot decrypt an event with no room id');

    const decrypted = (await this.#call('decryptRoomEvent', {
      event: JSON.stringify({
        event_id: event.getId(),
        type: event.getWireType(),
        sender: event.getSender(),
        room_id: roomId,
        origin_server_ts: event.getTs(),
        content: event.getWireContent(),
      }),
      roomId,
      decryptionSettings: { senderDeviceTrustRequirement: this.#deviceIsolationMode },
    })) as EngineDecryptedEvent;

    return {
      clearEvent: JSON.parse(decrypted.event) as EventDecryptionResult['clearEvent'],
      senderCurve25519Key: decrypted.senderCurve25519Key ?? undefined,
      claimedEd25519Key: decrypted.senderClaimedEd25519Key ?? undefined,
      forwardingCurve25519KeyChain: decrypted.forwardingCurve25519KeyChain ?? [],
    };
  }

  /** Stateless: needs the backup key, not the crypto store, so it stays in-process. */
  async getBackupDecryptor(
    backupInfo: KeyBackupInfo,
    privKey: Uint8Array
  ): Promise<BackupDecryptor> {
    if (backupInfo.algorithm !== 'm.megolm_backup.v1.curve25519-aes-sha2') {
      throw new Error(`Unsupported key backup algorithm ${backupInfo.algorithm}`);
    }

    const key = RustSdkCryptoJs.BackupDecryptionKey.fromBase64(encodeBase64(privKey));
    const authData = backupInfo.auth_data as { public_key?: string } | undefined;
    if (authData?.public_key !== key.megolmV1PublicKey.publicKeyBase64) {
      throw new Error('The backup key does not match this backup version');
    }

    return {
      sourceTrusted: false,
      async decryptSessions(ciphertexts) {
        return Object.entries(ciphertexts).map(([sessionId, session]) => {
          const decrypted = JSON.parse(
            key.decryptV1(
              session.session_data.ephemeral,
              session.session_data.mac,
              session.session_data.ciphertext
            )
          ) as IMegolmSessionData;
          decrypted.session_id = sessionId;
          return decrypted;
        });
      },
      free() {
        key.free();
      },
    };
  }

  async importBackedUpRoomKeys(
    keys: IMegolmSessionData[],
    backupVersion: string,
    opts?: ImportRoomKeysOpts
  ): Promise<void> {
    const result = (await this.#call('importBackedUpRoomKeys', {
      keys: JSON.stringify(keys),
      backupVersion,
    })) as { importedCount?: number; totalCount?: number } | null;

    const total = result?.totalCount ?? keys.length;
    const successes = result?.importedCount ?? 0;
    opts?.progressCallback?.({
      stage: ImportRoomKeyStage.LoadKeys,
      successes,
      failures: total - successes,
      total,
    });
  }

  /** MSC4268. The engine encrypts; we upload; only the mxc URL goes back. */
  async shareRoomHistoryWithUser(roomId: string, userId: string): Promise<void> {
    const own = await this.getUserVerificationStatus(this.#identity.userId);
    if (!own.isCrossSigningVerified()) {
      engineCryptoLog.warn(
        'general',
        'Not sharing message history: this device is not verified by our own identity'
      );
      return;
    }

    const bundle = (await this.#call('buildRoomKeyBundle', {
      roomId,
    })) as EngineRoomKeyBundle | null;
    if (!bundle) return;

    const { content_uri: url } = await this.#mx.uploadContent(
      new Blob([decodeBase64(bundle.encryptedData) as BlobPart]),
      { includeFilename: false }
    );

    await this.#call('queryKeysForUsers', { users: [userId] });
    await this.#flushOutgoingRequests();
    await this.#call('getMissingSessions', { users: [userId] });
    await this.#flushOutgoingRequests();

    await this.#call('shareRoomKeyBundleData', {
      userId,
      roomId,
      url,
      mediaEncryptionInfo: bundle.mediaEncryptionInfo,
      sharingStrategy: 'identityBasedStrategy',
    });
    await this.#flushOutgoingRequests();
  }

  /** MSC4268. The engine stores the bundle metadata; we fetch the media it points at. */
  async maybeAcceptKeyBundle(roomId: string, inviter: string): Promise<boolean> {
    const data = (await this.#call('getReceivedRoomKeyBundleData', {
      roomId,
      inviterId: inviter,
    })) as { url?: string } | null;
    if (!data?.url) return false;

    const httpUrl = new URL(
      getHttpUriForMxc(
        this.#mx.baseUrl,
        data.url,
        undefined,
        undefined,
        undefined,
        false,
        true,
        true
      )
    );
    const blob = await this.#mx.http.authedRequest<Blob>(
      Method.Get,
      httpUrl.pathname + httpUrl.search,
      {},
      undefined,
      { rawResponseBody: true, prefix: '' }
    );

    await this.#call('receiveRoomKeyBundle', {
      roomId,
      inviterId: inviter,
      bundle: encodeBase64(new Uint8Array(await blob.arrayBuffer())),
    });
    await this.#call('clearRoomPendingKeyBundle', { roomId });
    return true;
  }

  async markRoomAsPendingKeyBundle(roomId: string, inviterId: string): Promise<void> {
    await this.#call('storeRoomPendingKeyBundle', { roomId, inviterId });
  }

  setDeviceIsolationMode(isolationMode: DeviceIsolationMode): void {
    this.#deviceIsolationMode = isolationMode;
  }

  getVersion(): string {
    return 'Rust SDK (Sable engine over IPC)';
  }

  async getOwnDeviceKeys(): Promise<OwnDeviceKeys> {
    const keys = (await this.#call('identityKeys')) as { ed25519: string; curve25519: string };
    return { ed25519: keys.ed25519, curve25519: keys.curve25519 };
  }

  async isEncryptionEnabledInRoom(roomId: string): Promise<boolean> {
    return this.#mx.getRoom(roomId)?.hasEncryptionStateEvent() ?? false;
  }

  async isStateEncryptionEnabledInRoom(roomId: string): Promise<boolean> {
    const settings = (await this.#call('getRoomSettings', { roomId })) as {
      encryptStateEvents?: boolean;
    } | null;
    return settings?.encryptStateEvents ?? false;
  }

  prepareToEncrypt(room: Room): void {
    void room
      .getEncryptionTargetMembers()
      .then((members) =>
        this.#call('getMissingSessions', { users: members.map((member) => member.userId) })
      )
      .then(() => this.#flushOutgoingRequests())
      .catch((error: unknown) => engineCryptoLog.warn('general', 'prepareToEncrypt failed', error));
  }

  async forceDiscardSession(roomId: string): Promise<void> {
    await this.#call('invalidateGroupSession', { roomId });
  }

  async getEncryptionInfoForEvent(event: MatrixEvent): Promise<EventEncryptionInfo | null> {
    if (!event.getClearContent() || event.isDecryptionFailure()) return null;
    if (event.status !== null) {
      return { shieldColour: EventShieldColour.NONE, shieldReason: null };
    }

    const roomId = event.getRoomId();
    if (!roomId) return null;

    const info = (await this.#call('getRoomEventEncryptionInfo', {
      event: JSON.stringify({
        event_id: event.getId(),
        type: event.getWireType(),
        sender: event.getSender(),
        room_id: roomId,
        origin_server_ts: event.getTs(),
        content: event.getWireContent(),
      }),
      roomId,
    })) as EngineEncryptionInfo | null;

    return toEventEncryptionInfo(info);
  }

  async encryptToDeviceMessages(
    eventType: string,
    devices: { userId: string; deviceId: string }[],
    payload: ToDevicePayload
  ): Promise<ToDeviceBatch> {
    const batch = await Promise.all(
      devices.map(async ({ userId, deviceId }) => ({
        userId,
        deviceId,
        payload: JSON.parse(
          (await this.#call('device.encryptToDeviceEvent', {
            userId,
            deviceId,
            eventType,
            content: JSON.stringify(payload),
          })) as string
        ) as ToDevicePayload,
      }))
    );

    return { eventType: EventType.RoomMessageEncrypted, batch };
  }

  /** The outgoing-request queue has no interactive-auth path, so a server that challenges
   * the signing-key upload will reject it. */
  async resetEncryption(authUploadDeviceSigningKeys: UIAuthCallback<void>): Promise<void> {
    engineCryptoLog.info('general', 'Resetting encryption', {
      interactiveAuthAvailable: typeof authUploadDeviceSigningKeys === 'function',
    });
    await this.disableKeyStorage();
    await this.#call('bootstrapCrossSigning', { reset: true });
    await this.#flushOutgoingRequests();
    await this.resetKeyBackup();
  }

  async exportRoomKeys(): Promise<IMegolmSessionData[]> {
    return JSON.parse(await this.exportRoomKeysAsJson()) as IMegolmSessionData[];
  }

  async exportRoomKeysAsJson(): Promise<string> {
    // Already JSON text; stringifying again would double-encode the export.
    return (await this.#call('exportRoomKeys')) as string;
  }

  async importRoomKeys(keys: IMegolmSessionData[], opts?: ImportRoomKeysOpts): Promise<void> {
    await this.#call('importExportedRoomKeys', { keys: JSON.stringify(keys) });
    opts?.progressCallback?.({
      stage: ImportRoomKeyStage.LoadKeys,
      successes: keys.length,
      failures: 0,
      total: keys.length,
    });
  }

  async importRoomKeysAsJson(keys: string, opts?: ImportRoomKeysOpts): Promise<void> {
    await this.importRoomKeys(JSON.parse(keys) as IMegolmSessionData[], opts);
  }

  async userHasCrossSigningKeys(
    userId: string = this.#identity.userId,
    downloadUncached = false
  ): Promise<boolean> {
    if (downloadUncached) await this.#call('queryKeysForUsers', { users: [userId] });
    const identity = (await this.#call('getIdentity', { userId })) as EngineIdentityInfo | null;
    return identity !== null;
  }

  async getUserDeviceInfo(userIds: string[], downloadUncached = false): Promise<DeviceMap> {
    if (downloadUncached) await this.#call('queryKeysForUsers', { users: userIds });

    const map: DeviceMap = new Map();
    await Promise.all(
      userIds.map(async (userId) => {
        const devices = ((await this.#call('getUserDevices', {
          userId,
          timeoutSecs: null,
        })) ?? []) as EngineDevice[];

        map.set(userId, new Map(devices.map((device) => [device.deviceId, toSdkDevice(device)])));
      })
    );
    return map;
  }

  setTrustCrossSignedDevices(val: boolean): void {
    this.#trustCrossSignedDevices = val;
  }

  getTrustCrossSignedDevices(): boolean {
    return this.#trustCrossSignedDevices;
  }

  async getUserVerificationStatus(userId: string): Promise<UserVerificationStatus> {
    const identity = (await this.#call('getIdentity', { userId })) as EngineIdentityInfo | null;
    if (!identity) return new UserVerificationStatus(false, false, false);

    return new UserVerificationStatus(
      identity.isVerified,
      identity.wasPreviouslyVerified,
      true,
      identity.identityNeedsUserApproval ?? false
    );
  }

  async pinCurrentUserIdentity(userId: string): Promise<void> {
    await this.#call('userIdentity.pin', { userId });
  }

  async withdrawVerificationRequirement(userId: string): Promise<void> {
    await this.#call('userIdentity.withdrawVerification', { userId });
  }

  async getUserCrossSigningKeys(userId: string): Promise<Partial<CrossSigningKeys> | null> {
    const identity = (await this.#call('getIdentity', { userId })) as EngineIdentityInfo | null;
    if (!identity) return null;

    return {
      [CrossSigningKey.Master]: parseCrossSigningKey(identity.masterKey),
      [CrossSigningKey.SelfSigning]: parseCrossSigningKey(identity.selfSigningKey),
      [CrossSigningKey.UserSigning]: parseCrossSigningKey(identity.userSigningKey),
    };
  }

  async getDeviceVerificationStatus(
    userId: string,
    deviceId: string
  ): Promise<DeviceVerificationStatus | null> {
    const device = (await this.#call('getDevice', {
      userId,
      deviceId,
      timeoutSecs: null,
    })) as EngineDevice | null;
    if (!device) return null;

    return new DeviceVerificationStatus({
      signedByOwner: device.isCrossSignedByOwner,
      crossSigningVerified: device.isCrossSigningTrusted,
      localVerified: device.isLocallyTrusted,
      trustCrossSignedDevices: this.#trustCrossSignedDevices,
    });
  }

  async setDeviceVerified(userId: string, deviceId: string, verified = true): Promise<void> {
    await this.#call('device.setLocalTrust', {
      userId,
      deviceId,
      trustState: verified ? RustSdkCryptoJs.LocalTrust.Verified : RustSdkCryptoJs.LocalTrust.Unset,
    });
  }

  async crossSignDevice(deviceId: string): Promise<void> {
    await this.#call('device.verify', { userId: this.#identity.userId, deviceId });
    await this.#flushOutgoingRequests();
  }

  async isCrossSigningReady(): Promise<boolean> {
    const status = await this.getCrossSigningStatus();
    const cached = status.privateKeysCachedLocally;
    return (
      status.publicKeysOnDevice &&
      cached.masterKey &&
      cached.selfSigningKey &&
      cached.userSigningKey
    );
  }

  async getCrossSigningKeyId(
    type: CrossSigningKey = CrossSigningKey.Master
  ): Promise<string | null> {
    const keys = await this.getUserCrossSigningKeys(this.#identity.userId);
    const first = Object.values(keys?.[type]?.keys ?? {})[0];
    return first ?? null;
  }

  async bootstrapCrossSigning(opts: BootstrapCrossSigningOpts): Promise<void> {
    await this.#call('bootstrapCrossSigning', { reset: opts.setupNewCrossSigning ?? false });
    await this.#flushOutgoingRequests();
  }

  async isSecretStorageReady(): Promise<boolean> {
    return (await this.getSecretStorageStatus()).ready;
  }

  async getSecretStorageStatus(): Promise<SecretStorageStatus> {
    const defaultKeyId = await this.#mx.secretStorage.getDefaultKeyId();
    if (!defaultKeyId) {
      return { ready: false, defaultKeyId: null, secretStorageKeyValidityMap: {} };
    }

    const names: SecretStorageKey[] = [...SECRETS_IN_STORAGE];
    if (await this.getActiveSessionBackupVersion()) names.push('m.megolm_backup.v1');

    const entries = await Promise.all(
      names.map(
        async (name) => [name, Boolean(await this.#mx.secretStorage.isStored(name))] as const
      )
    );
    const secretStorageKeyValidityMap = Object.fromEntries(entries);

    return {
      ready: entries.every(([, stored]) => stored),
      defaultKeyId,
      secretStorageKeyValidityMap,
    };
  }

  async bootstrapSecretStorage(opts: CreateSecretStorageOpts): Promise<void> {
    const existingKeyId = await this.#mx.secretStorage.getDefaultKeyId();
    const needsKey = opts.setupNewSecretStorage || !existingKeyId;

    if (needsKey) {
      if (!opts.createSecretStorageKey) {
        throw new Error('bootstrapSecretStorage needs createSecretStorageKey to make a new key');
      }
      const key = await opts.createSecretStorageKey();
      const { keyId, keyInfo } = await this.#mx.secretStorage.addKey(
        SECRET_STORAGE_ALGORITHM_V1_AES,
        { ...key.keyInfo, key: key.privateKey }
      );
      await this.#mx.secretStorage.setDefaultKeyId(keyId);
      engineCryptoLog.info('general', 'Created a new secret storage key', {
        keyId,
        algorithm: keyInfo.algorithm,
      });
    }

    const exported = (await this.#call('exportCrossSigningKeys')) as Record<
      string,
      string | undefined
    > | null;
    if (exported) {
      const entries: [SecretStorageKey, string | undefined][] = [
        ['m.cross_signing.master', exported.masterKey],
        ['m.cross_signing.self_signing', exported.self_signing_key ?? exported.selfSigningKey],
        ['m.cross_signing.user_signing', exported.user_signing_key ?? exported.userSigningKey],
      ];
      await Promise.all(
        entries
          .filter(([, value]) => Boolean(value))
          .map(([name, value]) => this.#mx.secretStorage.store(name, value as string))
      );
    }

    if (opts.setupNewKeyBackup) await this.resetKeyBackup();
  }

  async getCrossSigningStatus(): Promise<CrossSigningStatus> {
    const status = (await this.#call('crossSigningStatus')) as {
      hasMaster: boolean;
      hasSelfSigning: boolean;
      hasUserSigning: boolean;
    };

    return {
      publicKeysOnDevice: status.hasMaster && status.hasSelfSigning && status.hasUserSigning,
      privateKeysInSecretStorage: false,
      privateKeysCachedLocally: {
        masterKey: status.hasMaster,
        selfSigningKey: status.hasSelfSigning,
        userSigningKey: status.hasUserSigning,
      },
    };
  }

  async createRecoveryKeyFromPassphrase(password?: string): Promise<GeneratedSecretStorageKey> {
    if (!password) {
      const key = new Uint8Array(32);
      globalThis.crypto.getRandomValues(key);
      return { privateKey: key, encodedPrivateKey: encodeRecoveryKey(key) };
    }

    const salt = secureRandomString(32);
    const privateKey = await deriveRecoveryKeyFromPassphrase(
      password,
      salt,
      RECOVERY_KEY_DERIVATION_ITERATIONS
    );

    return {
      keyInfo: {
        passphrase: {
          algorithm: 'm.pbkdf2',
          iterations: RECOVERY_KEY_DERIVATION_ITERATIONS,
          salt,
        },
      },
      privateKey,
      encodedPrivateKey: encodeRecoveryKey(privateKey),
    };
  }

  getVerificationRequestsToDeviceInProgress(userId: string): VerificationRequest[] {
    return [...this.#verificationRequests.values()].filter(
      (request) => request.otherUserId === userId && request.roomId === undefined
    );
  }

  findVerificationRequestDMInProgress(
    roomId: string,
    userId?: string
  ): VerificationRequest | undefined {
    return [...this.#verificationRequests.values()].find(
      (request) =>
        request.roomId === roomId &&
        request.pending &&
        (userId === undefined || request.otherUserId === userId)
    );
  }

  /** The engine needs the event id of the request we send, so build, send, then register. */
  async requestVerificationDM(userId: string, roomId: string): Promise<VerificationRequest> {
    const content = (await this.#call('userIdentity.verificationRequestContent', {
      userId,
      roomId,
      methods: SUPPORTED_VERIFICATION_METHOD_CODES,
    })) as string;

    const { event_id: eventId } = await this.#mx.sendEvent(
      roomId,
      EventType.RoomMessage,
      JSON.parse(content) as RoomMessageEventContent
    );

    const started = (await this.#call('userIdentity.requestVerificationDm', {
      userId,
      roomId,
      requestEventId: eventId,
      methods: SUPPORTED_VERIFICATION_METHOD_CODES,
    })) as { request: EngineVerificationState; outgoingRequest?: unknown };

    if (isOutgoingRequest(started.outgoingRequest)) {
      await sendOutgoingRequest(this.#mx, started.outgoingRequest);
    }
    await this.#flushOutgoingRequests();

    const request = new EngineVerificationRequest(this.#engineCall, started.request);
    this.#verificationRequests.set(started.request.flowId, request);
    return request;
  }

  async requestOwnUserVerification(): Promise<VerificationRequest> {
    return this.#startVerification('userIdentity.requestVerification', {
      userId: this.#identity.userId,
      methods: SUPPORTED_VERIFICATION_METHOD_CODES,
    });
  }

  async requestDeviceVerification(userId: string, deviceId: string): Promise<VerificationRequest> {
    return this.#startVerification('device.requestVerification', {
      userId,
      deviceId,
      methods: SUPPORTED_VERIFICATION_METHOD_CODES,
    });
  }

  async getSessionBackupPrivateKey(): Promise<Uint8Array | null> {
    const keys = (await this.#call('getBackupKeys')) as EngineBackupKeys | null;
    if (!keys?.decryptionKeyBase64) return null;
    return decodeBase64(keys.decryptionKeyBase64);
  }

  async storeSessionBackupPrivateKey(key: Uint8Array, version: string): Promise<void> {
    await this.#call('saveBackupDecryptionKey', { decryptionKey: encodeBase64(key), version });
  }

  async loadSessionBackupPrivateKeyFromSecretStorage(): Promise<void> {
    const encoded = await this.#mx.secretStorage.get('m.megolm_backup.v1');
    if (!encoded) throw new Error('No session backup key in secret storage');

    const backupInfo = await this.getKeyBackupInfo();
    if (!backupInfo?.version) throw new Error('No key backup version to attach the key to');

    await this.storeSessionBackupPrivateKey(decodeBase64(encoded), backupInfo.version);
  }

  async getActiveSessionBackupVersion(): Promise<string | null> {
    const enabled = (await this.#call('isBackupEnabled')) as boolean;
    if (!enabled) return null;
    const keys = (await this.#call('getBackupKeys')) as EngineBackupKeys | null;
    return keys?.backupVersion ?? null;
  }

  /** The engine reports signature trust only; whether our key opens it is separate. */
  async isKeyBackupTrusted(info: KeyBackupInfo): Promise<BackupTrustInfo> {
    const verification = (await this.#call('verifyBackup', {
      backupInfo: JSON.stringify(info),
    })) as { trusted?: boolean } | null;

    const stored = await this.getSessionBackupPrivateKey();
    const publicKey = (info.auth_data as { public_key?: string } | undefined)?.public_key;
    let matchesDecryptionKey = false;
    if (stored && publicKey) {
      const key = RustSdkCryptoJs.BackupDecryptionKey.fromBase64(encodeBase64(stored));
      try {
        matchesDecryptionKey = key.megolmV1PublicKey.publicKeyBase64 === publicKey;
      } finally {
        key.free();
      }
    }

    return { trusted: verification?.trusted ?? false, matchesDecryptionKey };
  }

  async getKeyBackupInfo(): Promise<KeyBackupInfo | null> {
    try {
      return await this.#mx.http.authedRequest<KeyBackupInfo>(
        Method.Get,
        '/room_keys/version',
        undefined,
        undefined,
        { prefix: ClientPrefix.V3 }
      );
    } catch (error) {
      if ((error as { errcode?: string }).errcode === 'M_NOT_FOUND') return null;
      throw error;
    }
  }

  async checkKeyBackupAndEnable(): Promise<KeyBackupCheck | null> {
    const backupInfo = await this.getKeyBackupInfo();
    if (!backupInfo?.version) return null;

    const trustInfo = await this.isKeyBackupTrusted(backupInfo);
    const authData = backupInfo.auth_data as { public_key?: string } | undefined;
    if (trustInfo.trusted && authData?.public_key) {
      await this.#call('enableBackupV1', {
        publicKeyBase64: authData.public_key,
        version: backupInfo.version,
      });
    }
    return { backupInfo, trustInfo };
  }

  async resetKeyBackup(): Promise<void> {
    const key = await this.createRecoveryKeyFromPassphrase();
    const publicKey = encodeBase64(
      RustSdkCryptoJs.BackupDecryptionKey.fromBase64(encodeBase64(key.privateKey)).megolmV1PublicKey
        .publicKeyBase64 as unknown as Uint8Array
    );

    const created = await this.#mx.http.authedRequest<{ version: string }>(
      Method.Post,
      '/room_keys/version',
      undefined,
      {
        algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2',
        auth_data: { public_key: publicKey },
      },
      { prefix: ClientPrefix.V3 }
    );

    await this.#call('enableBackupV1', { publicKeyBase64: publicKey, version: created.version });
    await this.storeSessionBackupPrivateKey(key.privateKey, created.version);
    await this.#mx.secretStorage.store('m.megolm_backup.v1', encodeBase64(key.privateKey));
  }

  async disableKeyStorage(): Promise<void> {
    const backupInfo = await this.getKeyBackupInfo();
    if (backupInfo?.version) await this.deleteKeyBackupVersion(backupInfo.version);
    else await this.#call('disableBackup');
  }

  async deleteKeyBackupVersion(version: string): Promise<void> {
    await this.#mx.http.authedRequest(
      Method.Delete,
      encodeUri('/room_keys/version/$version', { $version: version }),
      undefined,
      undefined,
      { prefix: ClientPrefix.V3 }
    );
    await this.#call('disableBackup');
  }

  async restoreKeyBackup(opts?: KeyBackupRestoreOpts): Promise<KeyBackupRestoreResult> {
    const keys = (await this.#call('getBackupKeys')) as EngineBackupKeys | null;
    if (!keys?.decryptionKeyBase64 || !keys.backupVersion) {
      throw new Error('No backup decryption key found in the crypto store');
    }

    const backupInfo = await this.getKeyBackupInfo();
    if (backupInfo?.version !== keys.backupVersion) {
      throw new Error(`Backup version ${keys.backupVersion} is not the one on the server`);
    }

    opts?.progressCallback?.({ stage: ImportRoomKeyStage.Fetch });

    const decryptor = await this.getBackupDecryptor(
      backupInfo,
      decodeBase64(keys.decryptionKeyBase64)
    );
    try {
      const response = await this.#mx.http.authedRequest<{
        rooms: Record<string, { sessions: Record<string, KeyBackupSession> }>;
      }>(Method.Get, '/room_keys/keys', { version: keys.backupVersion }, undefined, {
        prefix: ClientPrefix.V3,
      });

      const sessions: KeyBackupSession[] = [];
      const sessionIds: string[] = [];
      for (const [roomId, room] of Object.entries(response.rooms ?? {})) {
        for (const [sessionId, session] of Object.entries(room.sessions ?? {})) {
          sessionIds.push(sessionId);
          sessions.push({ ...session, room_id: roomId } as KeyBackupSession);
        }
      }

      const ciphertexts: Record<string, KeyBackupSession> = {};
      sessionIds.forEach((sessionId, index) => {
        const session = sessions[index];
        if (session) ciphertexts[sessionId] = session;
      });
      const decrypted = await decryptor.decryptSessions(ciphertexts);
      const withRooms = decrypted.map((session, index) => ({
        ...session,
        room_id: (sessions[index] as unknown as { room_id: string }).room_id,
      }));

      await this.importBackedUpRoomKeys(withRooms, keys.backupVersion, opts);
      return { total: withRooms.length, imported: withRooms.length };
    } finally {
      decryptor.free();
    }
  }

  async restoreKeyBackupWithPassphrase(
    passphrase: string,
    opts?: KeyBackupRestoreOpts
  ): Promise<KeyBackupRestoreResult> {
    const backupInfo = await this.getKeyBackupInfo();
    const passphraseInfo = backupInfo?.auth_data?.private_key_salt
      ? backupInfo.auth_data
      : undefined;
    if (!passphraseInfo?.private_key_salt || !passphraseInfo.private_key_iterations) {
      throw new Error('This backup was not created from a passphrase');
    }

    const privateKey = await deriveRecoveryKeyFromPassphrase(
      passphrase,
      passphraseInfo.private_key_salt,
      passphraseInfo.private_key_iterations
    );
    if (backupInfo?.version)
      await this.storeSessionBackupPrivateKey(privateKey, backupInfo.version);
    return this.restoreKeyBackup(opts);
  }

  async isDehydrationSupported(): Promise<boolean> {
    return false;
  }

  async startDehydration(opts?: StartDehydrationOpts | boolean): Promise<void> {
    // A dehydrated device is a second server-side device; Sable keeps one per session.
    throw new Error(
      `Device dehydration is not supported by the Sable crypto engine (opts: ${JSON.stringify(opts) ?? 'none'})`
    );
  }
}
