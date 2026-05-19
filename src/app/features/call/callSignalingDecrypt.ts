import type { CryptoBackend, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';
import { DECRYPT_TIMEOUT_MS } from './callSignalingPolicy';

const debugLog = createDebugLogger('CallSignaling');

export type DecryptedTimelineEvent = {
  type?: string;
  content?: unknown;
};

export const decryptRtcTimelineEvent = async (
  event: MatrixEvent,
  mx: MatrixClient
): Promise<DecryptedTimelineEvent | undefined> => {
  const crypto = mx.getCrypto();
  if (!crypto) return undefined;

  try {
    if (!event.isBeingDecrypted()) {
      await event.attemptDecryption(crypto as CryptoBackend);
    }

    const decryptionPromise = event.getDecryptionPromise();
    if (decryptionPromise) {
      await Promise.race([
        decryptionPromise,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, DECRYPT_TIMEOUT_MS);
        }),
      ]);
    }
  } catch (error) {
    debugLog.warn('call', 'RTC notification decryption failed', {
      eventId: event.getId(),
      roomId: event.getRoomId(),
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }

  const effectiveEvent = event.getEffectiveEvent();
  return {
    type: effectiveEvent.type,
    content: effectiveEvent.content,
  };
};
