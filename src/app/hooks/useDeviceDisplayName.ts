import { useEffect, useRef } from 'react';
import { ClientEvent, SyncState } from '$types/matrix-sdk';
import type { MatrixClient } from '$types/matrix-sdk';
import { deviceDisplayName } from '$utils/platform';
import { createLogger } from '$utils/debug';

const SYNC_READY = new Set([SyncState.Prepared, SyncState.Syncing, SyncState.Catchup]);
const log = createLogger('useDeviceDisplayName');

async function updateDeviceName(mx: MatrixClient) {
  const desired = deviceDisplayName();
  const device = await mx.getDevice(mx.getDeviceId()!);
  if (device?.display_name === desired) {
    log.log('already set:', desired);
    return;
  }
  await mx.setDeviceDetails(mx.getDeviceId()!, { display_name: desired });
  log.log(desired);
}

export function useDeviceDisplayName(mx: MatrixClient | undefined) {
  const updatedRef = useRef(false);

  useEffect(() => {
    if (!mx || updatedRef.current) return undefined;

    let cleanup: (() => void) | undefined;

    const state = mx.getSyncState();
    if (state && SYNC_READY.has(state)) {
      updatedRef.current = true;
      updateDeviceName(mx).catch(() => {});
    } else {
      const onSync = (syncState: SyncState) => {
        if (SYNC_READY.has(syncState)) {
          mx.removeListener(ClientEvent.Sync, onSync);
          updatedRef.current = true;
          updateDeviceName(mx).catch(() => {});
        }
      };
      mx.on(ClientEvent.Sync, onSync);
      cleanup = () => {
        mx.removeListener(ClientEvent.Sync, onSync);
      };
    }

    return cleanup;
  }, [mx]);
}
