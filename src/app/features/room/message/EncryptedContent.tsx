import type { MatrixEvent, MatrixEventHandlerMap } from '$types/matrix-sdk';
import { MatrixEventEvent, EventType } from '$types/matrix-sdk';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { useMatrixClient } from '$hooks/useMatrixClient';
import * as Sentry from '@sentry/react';

type EncryptedContentProps = {
  mEvent: MatrixEvent;
  children: () => ReactNode;
};

export function EncryptedContent({ mEvent, children }: EncryptedContentProps) {
  const mx = useMatrixClient();
  // Use a counter to force re-renders when decryption state changes
  // (using boolean state can be optimized away by React if value doesn't change)
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (mEvent.getType() !== (EventType.RoomMessageEncrypted as string)) return;
    // Sample 5% of events for per-event decryption latency profiling
    if (Math.random() < 0.05) {
      const start = performance.now();
      Sentry.startSpan({ name: 'decrypt.event', op: 'matrix.crypto' }, () =>
        mx.decryptEventIfNeeded(mEvent).then(() => {
          Sentry.metrics.distribution('sable.decryption.event_ms', performance.now() - start);
        })
      ).catch(() => undefined);
    } else {
      mx.decryptEventIfNeeded(mEvent).catch(() => undefined);
    }
  }, [mx, mEvent]);

  useEffect(() => {
    // Attach listener BEFORE checking state to avoid race condition where
    // decryption completes between state check and listener attachment
    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      if (event.isDecryptionFailure()) {
        Sentry.metrics.count('sable.decryption.failure', 1, {
          attributes: { reason: event.decryptionFailureReason ?? 'UNKNOWN_ERROR' },
        });
      }
      forceUpdate((n) => n + 1);
    };
    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);

    // If the event is already decrypted when this effect runs (e.g., loaded from cache
    // or decrypted by another component), force an immediate render
    if (mEvent.getType() !== (EventType.RoomMessageEncrypted as string)) {
      forceUpdate((n) => n + 1);
    }

    return () => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [mEvent]);

  return <>{children()}</>;
}
