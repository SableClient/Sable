import { isTauri } from '@tauri-apps/api/core';
import { engineDecryptPush } from '$generated/tauri/commands';
import type { IContent } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';

const pushDecryptLog = createDebugLogger('push-decrypt');

export type DecryptedPushEvent = {
  eventType: string;
  content: IContent;
  sender?: string;
};

export type EncryptedPushEvent = {
  roomId: string;
  eventId: string;
  sender?: string;
  content: IContent;
};

/**
 * Decrypts a push payload straight through the Rust `OlmMachine`. Null when the engine
 * cannot answer — usually a late Megolm key — and the caller falls back to the js-sdk
 * path, which retries as keys land.
 */
export const decryptPushEventNatively = async (
  userId: string | null,
  deviceId: string | null,
  event: EncryptedPushEvent
): Promise<DecryptedPushEvent | null> => {
  if (!userId || !deviceId) return null;

  try {
    if (!isTauri()) return null;

    const decrypted = await engineDecryptPush({
      userId,
      deviceId,
      roomId: event.roomId,
      eventJson: JSON.stringify({
        type: 'm.room.encrypted',
        content: event.content,
        room_id: event.roomId,
        event_id: event.eventId,
        sender: event.sender,
        origin_server_ts: Date.now(),
      }),
      passphrase: null,
    });

    // `engine_decrypt_push` reports snake_case, and hands the clear event over as JSON text.
    const clearEvent = JSON.parse(decrypted.clear_event) as { content?: IContent };
    const content = clearEvent?.content;
    if (!decrypted.event_type || !content) return null;

    return {
      eventType: decrypted.event_type,
      content,
      sender: decrypted.sender ?? event.sender,
    };
  } catch (error) {
    // Expected while the to-device key is still in flight, so not a warning.
    pushDecryptLog.info(
      'notification',
      'Native push decryption unavailable, falling back to the js-sdk path',
      error
    );
    return null;
  }
};
