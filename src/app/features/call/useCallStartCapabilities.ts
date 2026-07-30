import { useCallback, useMemo } from 'react';
import type { Room } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import { useCallEmbed } from '$hooks/useCallEmbed';
import { useAtomValue } from 'jotai';
import { livekitJsCallAtom } from '$state/livekitJsCall';
import { isNativeCallActive, nativeCallAtom } from '$state/nativeCall';
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
  const livekitJsCall = useAtomValue(livekitJsCallAtom);
  const nativeCall = useAtomValue(nativeCallAtom);
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();
  const myUserId = mx.getSafeUserId();
  const [updateCount, forceUpdate] = useForceUpdate();
  // A terminal native error session stays in the atom for display, but it is
  // not an active call and must not block starting a (later) call.
  const activeNativeCallRoomId = isNativeCallActive(nativeCall) ? nativeCall?.roomId : undefined;

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
      activeCallRoomId: callEmbed?.roomId ?? livekitJsCall?.roomId ?? activeNativeCallRoomId,
      livekitSupported,
      rtcSupported,
    });
  }, [
    room,
    myUserId,
    callEmbed?.roomId,
    livekitJsCall?.roomId,
    activeNativeCallRoomId,
    livekitSupported,
    rtcSupported,
    updateCount,
  ]);
};
