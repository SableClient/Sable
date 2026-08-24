import type { MouseEventHandler } from 'react';
import { useCallback, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import type { CryptoApi, CryptoBackend, KeyBackupInfo } from '$types/matrix-sdk';
import type { RectCords } from 'folds';
import {
  Badge,
  Box,
  Button,
  Chip,
  color,
  config,
  IconButton,
  Menu,
  percent,
  ProgressBar,
  Spinner,
  Text,
} from 'folds';
import { PopOut } from '$components/overlay-stack';
import FocusTrap from 'focus-trap-react';
import type { SecretStorageKeyContent } from '$types/matrix/accountData';
import { storePrivateKey } from '$client/secretStorageKeys';
import {
  BackupProgressStatus,
  backupRestoreErrorAtom,
  backupRestoreProgressAtom,
  isMissingBackupKeyError,
} from '$state/backupRestore';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import {
  useKeyBackupInfo,
  useKeyBackupStatus,
  useKeyBackupSync,
  useKeyBackupTrust,
  useSessionBackupKeyUsable,
} from '$hooks/useKeyBackup';
import { SecretStorageKeyMethod, SecretStorageKeyPrompt } from './SecretStorage';
import { stopPropagation } from '$utils/keyboard';
import { useRestoreBackupOnVerification } from '$hooks/useRestoreBackupOnVerification';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  Download,
  DotsThreeOutlineVerticalIcon,
  sizedIcon,
  menuIcon,
} from '$components/icons/phosphor';
import { InfoCard } from './info-card';

type BackupKeyRecoveryProps = {
  crypto: CryptoApi;
  secretStorageKeyId: string;
  secretStorageKeyContent: SecretStorageKeyContent;
};
function BackupKeyRecovery({
  crypto,
  secretStorageKeyId,
  secretStorageKeyContent,
}: BackupKeyRecoveryProps) {
  const mx = useMatrixClient();
  const cryptoBackend = crypto as CryptoBackend;
  const hasPassphrase = !!secretStorageKeyContent.passphrase;
  const [method, setMethod] = useState(
    hasPassphrase ? SecretStorageKeyMethod.RecoveryPassphrase : SecretStorageKeyMethod.RecoveryKey
  );

  const [unlockState, unlockBackup] = useAsyncCallback<void, Error, [Uint8Array]>(
    useCallback(
      async (recoveryKey: Uint8Array) => {
        storePrivateKey(secretStorageKeyId, recoveryKey);

        await cryptoBackend.processDeviceLists({ changed: [mx.getSafeUserId()] });
        await cryptoBackend.bootstrapCrossSigning({});
        await cryptoBackend.bootstrapSecretStorage({});

        const deviceId = mx.getDeviceId();
        if (!deviceId) {
          throw new Error('Unexpected Error! Current device ID not found.');
        }
        await cryptoBackend.setDeviceVerified(mx.getSafeUserId(), deviceId);

        // Emits KeyBackupDecryptionKeyCached, which drives the restore.
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      },
      [crypto, cryptoBackend, mx, secretStorageKeyId]
    )
  );

  const otherMethod =
    method === SecretStorageKeyMethod.RecoveryPassphrase
      ? SecretStorageKeyMethod.RecoveryKey
      : SecretStorageKeyMethod.RecoveryPassphrase;

  return (
    <Box direction="Column" gap="200">
      <Text size="T200">
        This device does not hold the backup decryption key. Provide your recovery details to
        restore device verification and unlock the backup.
      </Text>
      <SecretStorageKeyPrompt
        method={method}
        processing={unlockState.status === AsyncStatus.Loading}
        keyContent={secretStorageKeyContent}
        onDecodedRecoveryKey={unlockBackup}
      />
      {hasPassphrase && (
        <Box>
          <Chip
            type="button"
            variant="Secondary"
            fill="Soft"
            radii="Pill"
            onClick={() => setMethod(otherMethod)}
          >
            <Text as="span" size="B300">
              {otherMethod === SecretStorageKeyMethod.RecoveryPassphrase
                ? 'Use Recovery Passphrase'
                : 'Use Recovery Key'}
            </Text>
          </Chip>
        </Box>
      )}
      {unlockState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{unlockState.error.message}</b>
        </Text>
      )}
    </Box>
  );
}

type BackupStatusProps = {
  enabled: boolean;
};
function BackupStatus({ enabled }: BackupStatusProps) {
  return (
    <Box as="span" gap="100" alignItems="Center">
      <Badge variant={enabled ? 'Success' : 'Critical'} fill="Solid" size="200" radii="Pill" />
      <Text
        as="span"
        size="L400"
        style={{ color: enabled ? color.Success.Main : color.Critical.Main }}
      >
        {enabled ? 'Connected' : 'Disconnected'}
      </Text>
    </Box>
  );
}
type BackupSyncingProps = {
  count: number;
};
function BackupSyncing({ count }: BackupSyncingProps) {
  return (
    <Box as="span" gap="100" alignItems="Center">
      <Spinner size="50" variant="Primary" fill="Soft" />
      <Text as="span" size="L400" style={{ color: color.Primary.Main }}>
        Syncing ({count})
      </Text>
    </Box>
  );
}

function BackupProgressFetching() {
  return (
    <Box grow="Yes" gap="200" alignItems="Center">
      <Badge variant="Secondary" fill="Solid" radii="300">
        <Text size="L400">Restoring: 0%</Text>
      </Badge>
      <Box grow="Yes" direction="Column">
        <ProgressBar variant="Secondary" size="300" min={0} max={1} value={0} />
      </Box>
      <Spinner size="50" variant="Secondary" fill="Soft" />
    </Box>
  );
}

type BackupProgressProps = {
  total: number;
  downloaded: number;
};
function BackupProgress({ total, downloaded }: BackupProgressProps) {
  return (
    <Box grow="Yes" gap="200" alignItems="Center">
      <Badge variant="Secondary" fill="Solid" radii="300">
        <Text size="L400">Restoring: {`${Math.round(percent(0, total, downloaded))}%`}</Text>
      </Badge>
      <Box grow="Yes" direction="Column">
        <ProgressBar variant="Secondary" size="300" min={0} max={total} value={downloaded} />
      </Box>
      <Badge variant="Secondary" fill="Soft" radii="Pill">
        <Text size="L400">
          {downloaded} / {total}
        </Text>
      </Badge>
    </Box>
  );
}

type BackupTrustInfoProps = {
  crypto: CryptoApi;
  backupInfo: KeyBackupInfo;
};
function BackupTrustInfo({ crypto, backupInfo }: BackupTrustInfoProps) {
  const trust = useKeyBackupTrust(crypto, backupInfo);

  if (!trust) return null;

  return (
    <Box direction="Column">
      {trust.matchesDecryptionKey ? (
        <Text size="T200" style={{ color: color.Success.Main }}>
          <b>Backup has trusted decryption key.</b>
        </Text>
      ) : (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>Backup does not have trusted decryption key!</b>
        </Text>
      )}
      {trust.trusted ? (
        <Text size="T200" style={{ color: color.Success.Main }}>
          <b>Backup has trusted by signature.</b>
        </Text>
      ) : (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>Backup does not have trusted signature!</b>
        </Text>
      )}
    </Box>
  );
}

type BackupRestoreTileProps = {
  crypto: CryptoApi;
  secretStorageKeyId?: string;
  secretStorageKeyContent?: SecretStorageKeyContent;
};
export function BackupRestoreTile({
  crypto,
  secretStorageKeyId,
  secretStorageKeyContent,
}: BackupRestoreTileProps) {
  const [restoreProgress, setRestoreProgress] = useAtom(backupRestoreProgressAtom);
  const autoRestoreError = useAtomValue(backupRestoreErrorAtom);
  const restoring =
    restoreProgress.status === BackupProgressStatus.Fetching ||
    restoreProgress.status === BackupProgressStatus.Loading;

  const backupEnabled = useKeyBackupStatus(crypto);
  const backupInfo = useKeyBackupInfo(crypto);
  const backupKeyUsable = useSessionBackupKeyUsable(crypto);
  const [remainingSession, syncFailure] = useKeyBackupSync();

  const [menuCords, setMenuCords] = useState<RectCords>();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const [restoreState, restoreBackup] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await crypto.restoreKeyBackup({
        progressCallback(progress) {
          setRestoreProgress(progress);
        },
      });
    }, [crypto, setRestoreProgress])
  );

  const handleRestore = () => {
    setMenuCords(undefined);
    restoreBackup();
  };

  // backupKeyUsable is the structural signal; the error match only covers a
  // restore that failed for this reason before the lookup settled.
  const needsBackupKey =
    !!backupInfo &&
    (backupKeyUsable === false ||
      (restoreState.status === AsyncStatus.Error && isMissingBackupKeyError(restoreState.error)));

  return (
    <InfoCard
      variant="Surface"
      title="Encryption Backup"
      after={
        <Box alignItems="Center" gap="200">
          {remainingSession === 0 ? (
            <BackupStatus enabled={backupEnabled} />
          ) : (
            <BackupSyncing count={remainingSession} />
          )}
          <IconButton
            aria-pressed={!!menuCords}
            size="300"
            variant="Surface"
            radii="300"
            onClick={handleMenu}
          >
            {menuIcon(DotsThreeOutlineVerticalIcon, { weight: menuCords ? 'fill' : 'regular' })}
          </IconButton>
          <PopOut
            anchor={menuCords}
            offset={5}
            position="Bottom"
            align="End"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setMenuCords(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                  isKeyBackward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu
                  style={{
                    padding: config.space.S100,
                  }}
                >
                  <Box direction="Column" gap="100">
                    <Box direction="Column" gap="200">
                      <InfoCard
                        variant="SurfaceVariant"
                        title="Backup Details"
                        description={
                          <>
                            <span>Version: {backupInfo?.version ?? 'NIL'}</span>
                            <br />
                            <span>Keys: {backupInfo?.count ?? 'NIL'}</span>
                          </>
                        }
                      />
                    </Box>
                    <Button
                      size="300"
                      variant="Success"
                      radii="300"
                      aria-disabled={restoreState.status === AsyncStatus.Loading || restoring}
                      onClick={
                        restoreState.status === AsyncStatus.Loading || restoring
                          ? undefined
                          : handleRestore
                      }
                      before={sizedIcon(Download, '100')}
                    >
                      <Text size="B300">Restore Backup</Text>
                    </Button>
                  </Box>
                </Menu>
              </FocusTrap>
            }
          />
        </Box>
      }
    >
      {syncFailure && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{syncFailure}</b>
        </Text>
      )}
      {!backupEnabled && backupInfo === null && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>No backup present on server!</b>
        </Text>
      )}
      {!syncFailure && !backupEnabled && backupInfo && (
        <BackupTrustInfo crypto={crypto} backupInfo={backupInfo} />
      )}
      {restoreState.status === AsyncStatus.Loading && !restoring && <BackupProgressFetching />}
      {restoreProgress.status === BackupProgressStatus.Fetching && <BackupProgressFetching />}
      {restoreProgress.status === BackupProgressStatus.Loading && (
        <BackupProgress
          total={restoreProgress.data.total}
          downloaded={restoreProgress.data.downloaded}
        />
      )}
      {restoreState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{restoreState.error.message}</b>
        </Text>
      )}
      {autoRestoreError && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{autoRestoreError}</b>
        </Text>
      )}
      {needsBackupKey && secretStorageKeyId && secretStorageKeyContent && (
        <BackupKeyRecovery
          crypto={crypto}
          secretStorageKeyId={secretStorageKeyId}
          secretStorageKeyContent={secretStorageKeyContent}
        />
      )}
    </InfoCard>
  );
}

export function AutoRestoreBackupOnVerification() {
  useRestoreBackupOnVerification();

  return null;
}
