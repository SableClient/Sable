import { atom } from 'jotai';
import type { ImportRoomKeyProgressData } from '$types/matrix-sdk';
import { ImportRoomKeyStage } from '$types/matrix-sdk';

export enum BackupProgressStatus {
  Idle,
  Fetching,
  Loading,
  Done,
}
type ProgressData = {
  downloaded: number;
  successes: number;
  failures: number;
  total: number;
};
type IBackupProgress =
  | {
      status: BackupProgressStatus.Idle;
    }
  | {
      status: BackupProgressStatus.Fetching;
    }
  | {
      status: BackupProgressStatus.Loading;
      data: ProgressData;
    }
  | {
      status: BackupProgressStatus.Done;
    };

const baseBackupRestoreProgressAtom = atom<IBackupProgress>({
  status: BackupProgressStatus.Idle,
});

export const backupRestoreErrorAtom = atom<string | undefined>(undefined);

// Progress sticks at Fetching if a restore throws after it starts importing, and
// both atoms outlive an account switch since there is no jotai Provider.
export const resetBackupRestoreAtom = atom(null, (_get, set) => {
  set(baseBackupRestoreProgressAtom, { status: BackupProgressStatus.Idle });
  set(backupRestoreErrorAtom, undefined);
});

export const isMissingBackupKeyError = (error: unknown): boolean => {
  if (error === undefined || error === null) return false;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.toLowerCase().includes('no decryption key found');
};

export const backupRestoreProgressAtom = atom<
  IBackupProgress,
  [ImportRoomKeyProgressData],
  undefined
>(
  (get) => get(baseBackupRestoreProgressAtom),
  (get, set, progress) => {
    if (progress.stage === ImportRoomKeyStage.Fetch) {
      set(baseBackupRestoreProgressAtom, {
        status: BackupProgressStatus.Fetching,
      });
      return;
    }

    if (progress.stage === ImportRoomKeyStage.LoadKeys) {
      const { total, successes, failures } = progress;

      const downloaded = successes + failures;
      if (downloaded === total) {
        set(baseBackupRestoreProgressAtom, {
          status: BackupProgressStatus.Done,
        });
        return;
      }
      set(baseBackupRestoreProgressAtom, {
        status: BackupProgressStatus.Loading,
        data: {
          downloaded,
          successes,
          failures,
          total,
        },
      });
    }
  }
);
