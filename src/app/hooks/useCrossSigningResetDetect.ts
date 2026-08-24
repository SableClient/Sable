import { useCallback, useEffect, useRef } from 'react';
import type { CryptoBackend, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { useAccountDataCallback } from './useAccountDataCallback';

export const useCrossSigningResetDetect = (mx: MatrixClient | undefined) => {
  const refreshScheduled = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (refreshTimer.current === undefined) return;
      globalThis.clearTimeout(refreshTimer.current);
      refreshTimer.current = undefined;
      refreshScheduled.current = false;
    },
    [mx]
  );

  const onAccountData = useCallback(
    (evt: MatrixEvent) => {
      if (!mx || !evt.getType().startsWith('m.cross_signing.')) return;
      if (refreshScheduled.current) return;
      refreshScheduled.current = true;

      // Wait for sync to update crypto before refreshing device lists.
      refreshTimer.current = globalThis.setTimeout(() => {
        refreshTimer.current = undefined;
        const crypto = mx.getCrypto() as CryptoBackend | undefined;
        if (!crypto) {
          refreshScheduled.current = false;
          return;
        }

        void crypto
          .processDeviceLists({ changed: [mx.getSafeUserId()] })
          .catch(() => undefined)
          .finally(() => {
            refreshScheduled.current = false;
          });
      }, 0);
    },
    [mx]
  );

  useAccountDataCallback(mx, onAccountData);
};
