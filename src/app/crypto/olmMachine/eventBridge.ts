import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { EngineIdentity } from './engineInvoke';
import type { OlmMachineProxy } from './proxy';

const ROOM_KEYS_RECEIVED = 'matrix-crypto://room-keys-received';
const ROOM_KEYS_WITHHELD = 'matrix-crypto://room-keys-withheld';
const IDENTITIES_UPDATED = 'matrix-crypto://identities-updated';
const SECRET_RECEIVED = 'matrix-crypto://secret-received';

type Envelope<T> = { account: string; payload: T };

type RoomKeyPayload = { roomId: string; senderKey: string; sessionId: string; algorithm: number };
type WithheldPayload = { roomId: string; sessionId: string };

const roomKey = (key: RoomKeyPayload) => ({
  ...key,
  roomId: { toString: () => key.roomId },
  senderKey: { toBase64: () => key.senderKey, toString: () => key.senderKey },
});

const withheld = (session: WithheldPayload) => ({
  ...session,
  roomId: { toString: () => session.roomId },
});

// Must be torn down with the client, or a re-login leaks a listener.
export const startEngineEventBridge = async (
  proxy: OlmMachineProxy,
  identity: EngineIdentity
): Promise<UnlistenFn> => {
  const account = `${identity.userId}|${identity.deviceId}`;
  const forAccount =
    <T>(handle: (payload: T) => void) =>
    ({ payload: envelope }: { payload: Envelope<T> }) => {
      if (envelope.account !== account) return;
      handle(envelope.payload);
    };

  const unlisten = await Promise.all([
    listen<Envelope<RoomKeyPayload[]>>(
      ROOM_KEYS_RECEIVED,
      forAccount<RoomKeyPayload[]>((keys) => proxy.emit.roomKeysUpdated(keys.map(roomKey)))
    ),
    listen<Envelope<WithheldPayload[]>>(
      ROOM_KEYS_WITHHELD,
      forAccount<WithheldPayload[]>((sessions) =>
        proxy.emit.roomKeysWithheld(sessions.map(withheld))
      )
    ),
    listen<Envelope<{ identities: string[]; devices: string[] }>>(
      IDENTITIES_UPDATED,
      forAccount<{ identities: string[]; devices: string[] }>(({ identities, devices }) => {
        identities.forEach((userId) => proxy.emit.userIdentityUpdated(userId));
        if (devices.length > 0) proxy.emit.devicesUpdated(devices);
      })
    ),
    listen<Envelope<{ name: string }>>(
      SECRET_RECEIVED,
      // Secret values never leave the host; only the name travels.
      forAccount<{ name: string }>(({ name }) => proxy.emit.secretReceived(name, ''))
    ),
  ]);

  return () => unlisten.forEach((stop) => stop());
};
