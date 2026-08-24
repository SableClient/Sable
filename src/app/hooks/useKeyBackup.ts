import type {
  BackupTrustInfo,
  CryptoApi,
  CryptoEventHandlerMap,
  KeyBackupInfo,
} from '$types/matrix-sdk';
import { CryptoEvent } from '$types/matrix-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useMatrixClient } from './useMatrixClient';
import { useMatrixEvent } from './useMatrixEvent';
import { useAlive } from './useAlive';

const useKeyBackupStatusChange = (onChange: CryptoEventHandlerMap[CryptoEvent.KeyBackupStatus]) => {
  const mx = useMatrixClient();

  useMatrixEvent(mx, CryptoEvent.KeyBackupStatus, onChange);
};

export const useKeyBackupStatus = (crypto: CryptoApi): boolean => {
  const alive = useAlive();
  const [status, setStatus] = useState(false);

  useEffect(() => {
    crypto.getActiveSessionBackupVersion().then((v) => {
      if (alive()) {
        setStatus(typeof v === 'string');
      }
    });
  }, [crypto, alive]);

  useKeyBackupStatusChange(setStatus);

  return status;
};

const useKeyBackupSessionsRemainingChange = (
  onChange: CryptoEventHandlerMap[CryptoEvent.KeyBackupSessionsRemaining]
) => {
  const mx = useMatrixClient();

  useMatrixEvent(mx, CryptoEvent.KeyBackupSessionsRemaining, onChange);
};

const useKeyBackupFailedChange = (onChange: CryptoEventHandlerMap[CryptoEvent.KeyBackupFailed]) => {
  const mx = useMatrixClient();

  useMatrixEvent(mx, CryptoEvent.KeyBackupFailed, onChange);
};

export const useKeyBackupDecryptionKeyCached = (
  onChange: CryptoEventHandlerMap[CryptoEvent.KeyBackupDecryptionKeyCached]
) => {
  const mx = useMatrixClient();

  useMatrixEvent(mx, CryptoEvent.KeyBackupDecryptionKeyCached, onChange);
};

/**
 * Whether this device can actually restore from backup. `restoreKeyBackup`
 * requires BOTH a decryption key and a backup version in the store — it raises
 * the same "No decryption key found in crypto store" for either being absent,
 * while `getSessionBackupPrivateKey` only reports on the key. `undefined` while
 * unknown (first lookup in flight, or the lookup failed).
 */
export const useSessionBackupKeyUsable = (crypto: CryptoApi): boolean | undefined => {
  const alive = useAlive();
  const [usable, setUsable] = useState<boolean>();
  const requestRef = useRef(0);

  const fetchUsable = useCallback(() => {
    requestRef.current += 1;
    const request = requestRef.current;
    Promise.all([crypto.getSessionBackupPrivateKey(), crypto.getActiveSessionBackupVersion()])
      .then(([key, version]) => {
        // A later lookup already answered; this one is stale.
        if (alive() && request === requestRef.current) {
          const nextUsable = key !== null && version !== null;
          setUsable((current) => {
            if (current === true && !nextUsable) {
              Sentry.addBreadcrumb({
                category: 'crypto',
                message: 'Session backup key became unavailable',
                level: 'warning',
              });
              Sentry.metrics.count('sable.crypto.session_backup_key_lost', 1);
            }
            return nextUsable;
          });
        }
      })
      .catch(() => {
        if (alive() && request === requestRef.current) {
          setUsable((current) => {
            if (current === true) {
              Sentry.addBreadcrumb({
                category: 'crypto',
                message: 'Session backup key lookup failed',
                level: 'warning',
              });
              Sentry.metrics.count('sable.crypto.session_backup_key_lookup_failed', 1);
            }
            return undefined;
          });
        }
      });
  }, [crypto, alive]);

  useEffect(() => {
    fetchUsable();
  }, [fetchUsable]);

  useKeyBackupStatusChange(fetchUsable);
  useKeyBackupDecryptionKeyCached(fetchUsable);

  return usable;
};

export const useKeyBackupSync = (): [number, string | undefined] => {
  const [remaining, setRemaining] = useState(0);
  const [failure, setFailure] = useState<string>();

  useKeyBackupSessionsRemainingChange(
    useCallback((count) => {
      setRemaining(count);
      setFailure(undefined);
    }, [])
  );

  useKeyBackupFailedChange(
    useCallback((f) => {
      if (typeof f === 'string') {
        Sentry.addBreadcrumb({
          category: 'crypto',
          message: 'Key backup failed',
          level: 'error',
          data: { errcode: f },
        });
        Sentry.metrics.count('sable.crypto.key_backup_failures', 1, {
          attributes: { errcode: f },
        });
        setFailure(f);
        setRemaining(0);
      }
    }, [])
  );

  return [remaining, failure];
};

export const useKeyBackupInfo = (crypto: CryptoApi): KeyBackupInfo | undefined | null => {
  const alive = useAlive();
  const [info, setInfo] = useState<KeyBackupInfo | null>();

  const fetchInfo = useCallback(() => {
    crypto.getKeyBackupInfo().then((i) => {
      if (alive()) {
        setInfo(i);
      }
    });
  }, [crypto, alive]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  useKeyBackupStatusChange(fetchInfo);

  useKeyBackupSessionsRemainingChange(
    useCallback(
      (remainingCount) => {
        if (remainingCount === 0) {
          fetchInfo();
        }
      },
      [fetchInfo]
    )
  );

  return info;
};

export const useKeyBackupTrust = (
  crypto: CryptoApi,
  backupInfo: KeyBackupInfo
): BackupTrustInfo | undefined => {
  const alive = useAlive();
  const [trust, setTrust] = useState<BackupTrustInfo>();

  const fetchTrust = useCallback(() => {
    crypto.isKeyBackupTrusted(backupInfo).then((t) => {
      if (alive()) {
        setTrust(t);
      }
    });
  }, [crypto, alive, backupInfo]);

  useEffect(() => {
    fetchTrust();
  }, [fetchTrust]);

  useKeyBackupStatusChange(fetchTrust);

  useKeyBackupDecryptionKeyCached(fetchTrust);

  return trust;
};
