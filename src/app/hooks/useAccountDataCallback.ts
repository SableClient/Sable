import type { ClientEventHandlerMap, MatrixClient } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { useEffect } from 'react';

export const useAccountDataCallback = (
  mx: MatrixClient | undefined,
  onAccountData: ClientEventHandlerMap[ClientEvent.AccountData]
) => {
  useEffect(() => {
    if (!mx) return undefined;
    mx.on(ClientEvent.AccountData, onAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, onAccountData);
    };
  }, [mx, onAccountData]);
};
