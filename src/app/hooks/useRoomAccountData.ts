import type { Room, RoomEventHandlerMap } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { useCallback, useEffect, useState } from 'react';

export const useRoomAccountData = (room: Room): Map<string, object> => {
  const getAccountData = useCallback((): Map<string, object> => {
    const accountData = new Map<string, object>();

    Array.from(room.accountData.entries()).forEach(([type, mEvent]) => {
      const content = mEvent.getContent();
      accountData.set(type, content);
    });

    return accountData;
  }, [room]);

  const [accountData, setAccountData] = useState<Map<string, object>>(getAccountData);

  useEffect(() => {
    const handleEvent: RoomEventHandlerMap[RoomEvent.AccountData] = () => {
      setAccountData(getAccountData());
    };
    room.on(RoomEvent.AccountData, handleEvent);
    return () => {
      room.removeListener(RoomEvent.AccountData, handleEvent);
    };
  }, [room, getAccountData]);

  return accountData;
};
