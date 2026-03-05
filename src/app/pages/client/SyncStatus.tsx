import { MatrixClient, SyncState } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSetAtom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { useSyncState } from '$hooks/useSyncState';
import { titlebarStatusAtom, type TitlebarStatusView } from '$state/titlebarStatus';
import {
  getSyncConnectionStatusView,
  SyncConnectionStatusBanner,
} from '$components/SyncConnectionStatus';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
};

type SyncStatusProps = {
  mx: MatrixClient;
};

const DEMO_STATUS_STEP_MS = 1500;
const DEMO_STATUS_SEQUENCE: readonly (TitlebarStatusView | null)[] = [
  { text: 'Connecting...', variant: 'Success' },
  null,
  { text: 'Connection Lost! Reconnecting...', variant: 'Warning' },
  null,
  { text: 'Connection Lost!', variant: 'Critical' },
  null,
];

const isSyncStatusDemoEnabled = (): boolean => {
  if (import.meta.env.VITE_DEMO_SYNC_STATUS === '1') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demoSyncStatus') === '1';
};

export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
  });
  const [demoIndex, setDemoIndex] = useState(0);
  const useDemoStatusLoop = isSyncStatusDemoEnabled();
  const setTitlebarStatus = useSetAtom(titlebarStatusAtom);
  const { current, previous } = stateData;

  useSyncState(
    mx,
    useCallback((nextCurrent, nextPrevious) => {
      setStateData((s) => {
        if (s.current === nextCurrent && s.previous === nextPrevious) {
          return s;
        }
        return { current: nextCurrent, previous: nextPrevious };
      });
    }, [])
  );

  useEffect(() => {
    if (!useDemoStatusLoop) return undefined;
    const intervalId = window.setInterval(() => {
      setDemoIndex((index) => (index + 1) % DEMO_STATUS_SEQUENCE.length);
    }, DEMO_STATUS_STEP_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [useDemoStatusLoop]);

  const statusView = useMemo(() => {
    if (useDemoStatusLoop) return DEMO_STATUS_SEQUENCE[demoIndex];
    return getSyncConnectionStatusView(current, previous);
  }, [current, demoIndex, previous, useDemoStatusLoop]);

  const useTitlebarSlot = isTauri() && osType() === 'windows';
  useEffect(() => {
    if (!useTitlebarSlot) return undefined;
    setTitlebarStatus(statusView);
    return () => {
      setTitlebarStatus(null);
    };
  }, [statusView, setTitlebarStatus, useTitlebarSlot]);

  if (useTitlebarSlot) return null;

  return <SyncConnectionStatusBanner status={statusView} />;
}
