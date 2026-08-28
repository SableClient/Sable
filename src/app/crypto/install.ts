import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import { ReEmitter } from 'matrix-js-sdk/lib/ReEmitter';
import { isTauri } from '@tauri-apps/api/core';
import { ClientEvent, RoomMemberEvent, RoomStateEvent } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, RoomMember } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';
import { engineOpen } from '$generated/tauri/commands';
import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';
import { engineInvoke } from './olmMachine/engineInvoke';
import { EngineCrypto } from './engineCrypto/EngineCrypto';
import { startCryptoEventBridge } from './engineCrypto/eventBridge';

const cryptoLog = createDebugLogger('rust-crypto-install');

const wasmCryptoStoreExists = async (cryptoDatabasePrefix: string): Promise<boolean> => {
  const name = `${cryptoDatabasePrefix}::matrix-sdk-crypto`;
  // Cannot look without creating, so assume legacy rather than seize the device id.
  if (!indexedDB.databases) return true;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === name);
};

export class LegacyWasmCryptoStoreError extends Error {
  constructor() {
    super(
      'Encrypted chat has been upgraded to the native crypto engine. Sign out and sign in again to continue. Local encrypted-message keys from this installation will need to be restored from backup.'
    );
    this.name = 'LegacyWasmCryptoStoreError';
  }
}

export const isLegacyWasmCryptoStoreError = (error: unknown): error is LegacyWasmCryptoStoreError =>
  error instanceof LegacyWasmCryptoStoreError;

export const rustEngineEnabled = async (cryptoDatabasePrefix: string): Promise<boolean> => {
  if (!isTauri()) return false;
  if (await wasmCryptoStoreExists(cryptoDatabasePrefix)) {
    cryptoLog.warn('general', 'Legacy WASM crypto store requires re-authentication');
    throw new LegacyWasmCryptoStoreError();
  }
  return true;
};

type InstallResult = {
  rustCrypto: EngineCrypto;
};

const MAX_INVITE_ACCEPTANCE_MS_FOR_KEY_BUNDLE = 24 * 60 * 60 * 1000;

const REEMITTED_CRYPTO_EVENTS = [
  CryptoEvent.VerificationRequestReceived,
  CryptoEvent.UserTrustStatusChanged,
  CryptoEvent.KeyBackupStatus,
  CryptoEvent.KeyBackupSessionsRemaining,
  CryptoEvent.KeyBackupFailed,
  CryptoEvent.KeyBackupDecryptionKeyCached,
  CryptoEvent.KeysChanged,
  CryptoEvent.DevicesUpdated,
  CryptoEvent.WillUpdateDevices,
  CryptoEvent.DehydratedDeviceCreated,
  CryptoEvent.DehydratedDeviceUploaded,
  CryptoEvent.RehydrationStarted,
  CryptoEvent.RehydrationProgress,
  CryptoEvent.RehydrationCompleted,
  CryptoEvent.RehydrationError,
  CryptoEvent.DehydrationKeyCached,
  CryptoEvent.DehydratedDeviceRotationError,
];

export const reEmitCryptoEvents = (mx: MatrixClient, crypto: EngineCrypto): (() => void) => {
  const reEmitter = new ReEmitter(mx);
  reEmitter.reEmit(crypto, REEMITTED_CRYPTO_EVENTS);
  return () => reEmitter.stopReEmitting(crypto, REEMITTED_CRYPTO_EVENTS);
};

export const wireCryptoClientEvents = (mx: MatrixClient, crypto: EngineCrypto): (() => void) => {
  const onLiveEvent = (event: MatrixEvent) => {
    void crypto.onLiveEventFromSync(event);
  };
  const onMembership = (event: MatrixEvent, member: RoomMember, oldMembership?: string) => {
    crypto.onRoomMembership(event, member, oldMembership);
  };
  const onStateEvent = (event: MatrixEvent) => {
    crypto.onRoomStateEvent(event);
  };

  mx.on(ClientEvent.Event, onLiveEvent);
  mx.on(RoomMemberEvent.Membership, onMembership);
  mx.on(RoomStateEvent.Events, onStateEvent);

  return () => {
    mx.removeListener(ClientEvent.Event, onLiveEvent);
    mx.removeListener(RoomMemberEvent.Membership, onMembership);
    mx.removeListener(RoomStateEvent.Events, onStateEvent);
  };
};

export const installRustCrypto = async (
  mx: MatrixClient,
  options: { storeDir?: string; passphrase?: string } = {}
): Promise<InstallResult> => {
  // getBackupDecryptor uses the wasm primitive in-process, so the module must be ready.
  await RustSdkCryptoJs.initAsync();

  const userId = mx.getUserId();
  const deviceId = mx.getDeviceId();
  if (!userId || !deviceId) {
    throw new Error('Cannot install the Rust crypto engine before the session has an identity');
  }

  await engineOpen({
    dir: options.storeDir ?? null,
    passphrase: options.passphrase ?? null,
    userId,
    deviceId,
  });

  const identity = { userId, deviceId };
  const engineCrypto = new EngineCrypto(mx, identity);

  // `MatrixClient.initRustCrypto` normally wires these events to the client. The native
  // engine is installed independently, so reproduce that SDK initialization step here.
  const stopReEmittingCryptoEvents = reEmitCryptoEvents(mx, engineCrypto);
  const stopClientEvents = wireCryptoClientEvents(mx, engineCrypto);
  const stopEventBridge = await startCryptoEventBridge(engineCrypto, identity);

  const stopEngineCrypto = engineCrypto.stop.bind(engineCrypto);
  engineCrypto.stop = () => {
    stopReEmittingCryptoEvents();
    stopClientEvents();
    stopEventBridge();
    stopEngineCrypto();
  };

  await acceptPendingKeyBundles(engineCrypto, identity);

  (mx as unknown as { cryptoBackend?: unknown }).cryptoBackend = engineCrypto;
  cryptoLog.info('general', 'Installed the Rust IPC crypto engine', { userId, deviceId });

  return { rustCrypto: engineCrypto };
};

/**
 * MSC4268: invites accepted before the key bundle arrived are marked pending by the
 * engine. Import what is still in the window and forget the rest, or the list grows
 * forever.
 */
const acceptPendingKeyBundles = async (
  crypto: EngineCrypto,
  identity: { userId: string; deviceId: string }
): Promise<void> => {
  const pending = ((await engineInvoke(identity, 'getAllRoomsPendingKeyBundles')) ?? []) as {
    roomId: string;
    inviterId: string;
    inviteAcceptedAtMillis: number;
  }[];

  for (const { roomId, inviterId, inviteAcceptedAtMillis } of pending) {
    if (Date.now() - inviteAcceptedAtMillis <= MAX_INVITE_ACCEPTANCE_MS_FOR_KEY_BUNDLE) {
      // eslint-disable-next-line no-await-in-loop
      await crypto.maybeAcceptKeyBundle(roomId, inviterId);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await engineInvoke(identity, 'clearRoomPendingKeyBundle', { roomId });
    }
  }
};
