import { useCallback, useMemo } from 'react';
import type { Room } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import { useCallEmbed } from '$hooks/useCallEmbed';
import { useLivekitSupport } from '$hooks/useLivekitSupport';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useStateEventCallback } from '$hooks/useStateEventCallback';
import { useForceUpdate } from '$hooks/useForceUpdate';
import { webRTCSupported } from '$utils/rtc';
import {
  evaluateCallStartCapabilities,
  type CallStartCapabilities,
} from '$features/call/callStartCapabilities';

export const useCallStartCapabilities = (room: Room): CallStartCapabilities => {
  const mx = useMatrixClient();
  const callEmbed = useCallEmbed();
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();
  const myUserId = mx.getSafeUserId();
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (event) => {
        if (event.getRoomId() !== room.roomId) return;
        const eventType = event.getType();
        if (
          eventType === (EventType.RoomPowerLevels as string) ||
          (eventType === (EventType.RoomMember as string) && event.getStateKey() === myUserId)
        ) {
          forceUpdate();
        }
      },
      [room.roomId, myUserId, forceUpdate]
    )
  );

  return useMemo(() => {
    void updateCount;
    return evaluateCallStartCapabilities({
      room,
      myUserId,
      activeCallRoomId: callEmbed?.roomId,
      livekitSupported,
      rtcSupported,
    });
  }, [room, myUserId, callEmbed?.roomId, livekitSupported, rtcSupported, updateCount]);
};
