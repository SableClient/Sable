import type {
  BackupTrustInfo,
  CryptoApi,
  CryptoEventHandlerMap,
  KeyBackupInfo,
} from '$types/matrix-sdk';
import { CryptoEvent } from '$types/matrix-sdk';
import { useCallback, useEffect, useState } from 'react';
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
