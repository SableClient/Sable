import { useMemo } from 'react';
import type { Room } from '$types/matrix-sdk';
import { useCallEmbed } from '$hooks/useCallEmbed';
import { useLivekitSupport } from '$hooks/useLivekitSupport';
import { useMatrixClient } from '$hooks/useMatrixClient';
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

  return useMemo(
    () =>
      evaluateCallStartCapabilities({
        room,
        myUserId,
        activeCallRoomId: callEmbed?.roomId,
        livekitSupported,
        rtcSupported,
      }),
    [room, myUserId, callEmbed?.roomId, livekitSupported, rtcSupported]
  );
};
