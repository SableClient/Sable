import type { ClientEventHandlerMap, MatrixClient } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { useEffect } from 'react';

export const useSyncState = (
  mx: MatrixClient | undefined,
  onChange: ClientEventHandlerMap[ClientEvent.Sync]
): void => {
  useEffect(() => {
    mx?.on(ClientEvent.Sync, onChange);
    return () => {
      mx?.removeListener(ClientEvent.Sync, onChange);
    };
  }, [mx, onChange]);
};
