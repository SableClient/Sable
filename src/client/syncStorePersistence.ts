import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('syncStorePersistence');

// The sync loop writes the store at most once every five minutes, so read
// receipts, m.fully_read and refreshed notification counts learned since the
// last write are lost on close and the next startup restores a snapshot from
// before those rooms were read.
const MIN_FLUSH_INTERVAL_MS = 5000;
// Our receipt only reaches the store once /sync echoes it back, and a write
// serialises the whole accumulator, so trail it.
const RECEIPT_FLUSH_DELAY_MS = 60000;

const cleanupByClient = new WeakMap<MatrixClient, () => void>();

type ReceiptContent = Record<string, Record<string, Record<string, unknown>>>;

const hasOwnReceipt = (event: MatrixEvent, userId: string): boolean =>
  Object.values(event.getContent<ReceiptContent>()).some((byReceiptType) =>
    Object.values(byReceiptType).some((byUser) => userId in byUser)
  );

export const installSyncStorePersistence = (mx: MatrixClient): void => {
  cleanupByClient.get(mx)?.();

  let lastFlushTs = 0;
  let flushing = false;
  let receiptTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const flush = (): boolean => {
    const now = Date.now();
    if (flushing || now - lastFlushTs < MIN_FLUSH_INTERVAL_MS) return false;
    flushing = true;
    lastFlushTs = now;
    void mx.store
      .save(true)
      .catch((error: unknown) => {
        debugLog.warn('sync', 'Failed to flush sync store', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        flushing = false;
      });
    return true;
  };

  const scheduleReceiptFlush = () => {
    if (receiptTimer !== undefined) return;
    receiptTimer = globalThis.setTimeout(() => {
      receiptTimer = undefined;
      if (!flush()) scheduleReceiptFlush();
    }, RECEIPT_FLUSH_DELAY_MS);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const onPageHide = () => {
    flush();
  };

  const onReceipt = (event: MatrixEvent) => {
    const userId = mx.getUserId();
    if (!userId || !hasOwnReceipt(event, userId)) return;
    scheduleReceiptFlush();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  mx.on(RoomEvent.Receipt, onReceipt);

  cleanupByClient.set(mx, () => {
    if (receiptTimer !== undefined) globalThis.clearTimeout(receiptTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    mx.removeListener(RoomEvent.Receipt, onReceipt);
    cleanupByClient.delete(mx);
  });
};

export const disposeSyncStorePersistence = (mx: MatrixClient): void => {
  cleanupByClient.get(mx)?.();
};
