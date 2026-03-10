import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { useCallStart } from '$hooks/useCallEmbed';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { autoJoinCallIntentAtom } from '$state/callEmbed';

export function useAutoJoinCall() {
  const mx = useMatrixClient();
  const selectedRoomId = useSelectedRoom();
  const [autoJoinIntent, setAutoJoinIntent] = useAtom(autoJoinCallIntentAtom);
  const startCall = useCallStart();

  useEffect(() => {
    if (selectedRoomId && autoJoinIntent && selectedRoomId === autoJoinIntent) {
      const room = mx.getRoom(selectedRoomId);

      if (room) {
        startCall(room);
        setAutoJoinIntent(null);
      }
    }
  }, [selectedRoomId, autoJoinIntent, startCall, setAutoJoinIntent, mx]);
}
