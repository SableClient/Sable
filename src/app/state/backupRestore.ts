import { atom } from 'jotai';
import type { ImportRoomKeyProgressData } from '$types/matrix-sdk';
import { ImportRoomKeyStage } from '$types/matrix-sdk';

export enum BackupProgressStatus {
  Idle,
  Fetching,
  Loading,
  Done,
}
export type ProgressData = {
  downloaded: number;
  successes: number;
  failures: number;
  total: number;
};
export type IBackupProgress =
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
