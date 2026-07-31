import { logger } from 'matrix-js-sdk/lib/logger';
import { RustCrypto } from 'matrix-js-sdk/lib/rust-crypto/rust-crypto';
import { isTauri } from '@tauri-apps/api/core';
import type { MatrixClient } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';
import { engineOpen } from '$generated/tauri/commands';
import { OlmMachineProxy, type EngineOpenInfo } from './olmMachine/proxy';
import { engineInvoke } from './olmMachine/engineInvoke';
import { startEngineEventBridge } from './olmMachine/eventBridge';
import { patchQrCodeScan } from './olmMachine/qrCodeScan';
import { installVerificationOverrides } from './verificationOverrides';

const cryptoLog = createDebugLogger('rust-crypto-install');

// Enabling the engine forces re-authentication as a new device.
export const rustEngineEnabled = (): boolean =>
  isTauri() && localStorage.getItem('sable_rust_crypto') === '1';

type InstallResult = {
  rustCrypto: RustCrypto;
  proxy: OlmMachineProxy;
};

const MAX_INVITE_ACCEPTANCE_MS_FOR_KEY_BUNDLE = 24 * 60 * 60 * 1000;

export const installRustCrypto = async (
  mx: MatrixClient,
  options: { storeDir?: string; passphrase?: string } = {}
): Promise<InstallResult> => {
  patchQrCodeScan();

  const userId = mx.getUserId();
  const deviceId = mx.getDeviceId();
  if (!userId || !deviceId) {
    throw new Error('Cannot install the Rust crypto engine before the session has an identity');
  }

  const opened = await engineOpen({
    dir: options.storeDir ?? null,
    passphrase: options.passphrase ?? null,
    userId,
    deviceId,
  });

  // `engine_open` reports snake_case.
  const deviceCreationTimeMs = (await engineInvoke(
    { userId, deviceId },
    'deviceCreationTimeMs'
  )) as number;

  const info: EngineOpenInfo = {
    userId: opened.user_id,
    deviceId: opened.device_id,
    ed25519Key: opened.ed25519_key,
    curve25519Key: opened.curve25519_key,
    deviceCreationTimeMs,
  };

  const proxy = new OlmMachineProxy(info);
  proxy.roomKeyRequestsEnabled = false;

  const rustCrypto = new RustCrypto(
    logger,
    proxy as never,
    mx.http as never,
    userId,
    deviceId,
    mx.secretStorage,
    mx.cryptoCallbacks
  );

  installVerificationOverrides(rustCrypto, proxy);

  proxy.registerRoomKeyUpdatedCallback((sessions) => rustCrypto.onRoomKeysUpdated(sessions as never));
  proxy.registerRoomKeysWithheldCallback((withheld) =>
    rustCrypto.onRoomKeysWithheld(withheld as never)
  );
  proxy.registerUserIdentityUpdatedCallback((updated) =>
    rustCrypto.onUserIdentityUpdated(updated as never)
  );
  proxy.registerDevicesUpdatedCallback((userIds) => rustCrypto.onDevicesUpdated(userIds));

  void rustCrypto.checkSecrets('m.megolm_backup.v1');
  proxy.registerReceiveSecretCallback((name) => rustCrypto.checkSecrets(name));

  // Torn down with the client, or a re-login leaks a listener.
  const stopEventBridge = await startEngineEventBridge(proxy, { userId, deviceId });
  const stopRustCrypto = rustCrypto.stop.bind(rustCrypto);
  rustCrypto.stop = () => {
    stopEventBridge();
    stopRustCrypto();
  };

  await proxy.outgoingRequests();

  await acceptPendingKeyBundles(proxy, rustCrypto);

  (mx as unknown as { cryptoBackend?: unknown }).cryptoBackend = rustCrypto;
  cryptoLog.info('general', 'Installed the Rust IPC crypto engine', { userId, deviceId });

  return { rustCrypto, proxy };
};

const acceptPendingKeyBundles = async (
  proxy: OlmMachineProxy,
  rustCrypto: RustCrypto
): Promise<void> => {
  const pending = (await proxy.getAllRoomsPendingKeyBundles()) as {
    roomId: string;
    inviterId: string;
    inviteAcceptedAtMillis: number;
  }[];

  for (const details of pending) {
    const { roomId, inviterId } = details;
    if (Date.now() - details.inviteAcceptedAtMillis <= MAX_INVITE_ACCEPTANCE_MS_FOR_KEY_BUNDLE) {
      // eslint-disable-next-line no-await-in-loop
      await rustCrypto.maybeAcceptKeyBundle(roomId, inviterId);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await proxy.clearRoomPendingKeyBundle(roomId);
    }
  }
};
