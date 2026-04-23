import { useState, useCallback } from 'react';
import type { AccountDataEvents } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';

export function useAccountData(eventType: string) {
  const mx = useMatrixClient();
  const [event, setEvent] = useState(() => mx.getAccountData(eventType as keyof AccountDataEvents));

  useAccountDataCallback(
    mx,
    useCallback(
      (evt) => {
        if (evt.getType() === eventType) {
          setEvent(evt);
        }
      },
      [eventType, setEvent]
    )
  );

  return event;
}
