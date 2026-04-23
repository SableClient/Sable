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
  const [, toggleEncrypted] = useState(
    mEvent.getType() === (EventType.RoomMessageEncrypted as string)
  );

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
    toggleEncrypted(mEvent.getType() === (EventType.RoomMessageEncrypted as string));
    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      if (event.isDecryptionFailure()) {
        Sentry.metrics.count('sable.decryption.failure', 1, {
          attributes: { reason: event.decryptionFailureReason ?? 'UNKNOWN_ERROR' },
        });
      }
      toggleEncrypted(event.getType() === (EventType.RoomMessageEncrypted as string));
    };
    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [mEvent]);

  return <>{children()}</>;
}
