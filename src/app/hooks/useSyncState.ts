import type { ClientEventHandlerMap, MatrixClient } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { useEffect } from 'react';

export const useSyncState = (
  mx: MatrixClient | undefined,
  onChange: ClientEventHandlerMap[ClientEvent.Sync]
): void => {
  useEffect(() => {
    if (!mx) return undefined;

    mx.on(ClientEvent.Sync, onChange);

    const currentState = mx.getSyncState();
    if (currentState) onChange(currentState, null);

    return () => {
      mx?.removeListener(ClientEvent.Sync, onChange);
    };
  }, [mx, onChange]);
};
