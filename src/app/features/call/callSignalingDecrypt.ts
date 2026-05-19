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

  if (event.isDecryptionFailure()) return undefined;

  try {
    if (!event.isBeingDecrypted()) {
      await event.attemptDecryption(crypto as CryptoBackend);
    }

    const decryptionPromise = event.getDecryptionPromise();
    if (decryptionPromise) {
      let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
      await Promise.race([
        decryptionPromise.finally(() => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        }),
        new Promise<void>((resolve) => {
          timeoutId = window.setTimeout(resolve, DECRYPT_TIMEOUT_MS);
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

  if (event.isBeingDecrypted() || event.isDecryptionFailure()) {
    return undefined;
  }

  const effectiveEvent = event.getEffectiveEvent();
  return {
    type: effectiveEvent.type,
    content: effectiveEvent.content,
  };
};
