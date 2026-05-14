import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useCallStart } from '$hooks/useCallEmbed';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { autoJoinCallIntentAtom } from '$state/callEmbed';
import { mDirectAtom } from '$state/mDirectList';
import { useCallPreferences } from '$state/hooks/callPreferences';

export function useAutoJoinCall() {
  const mx = useMatrixClient();
  const selectedRoomId = useSelectedRoom();
  const [autoJoinIntent, setAutoJoinIntent] = useAtom(autoJoinCallIntentAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const callPreferences = useCallPreferences();
  const startDirectCall = useCallStart(true);
  const startRoomCall = useCallStart(false);

  useEffect(() => {
    if (selectedRoomId && autoJoinIntent && selectedRoomId === autoJoinIntent.roomId) {
      const room = mx.getRoom(selectedRoomId);

      if (room) {
        const startCall = mDirects.has(room.roomId) ? startDirectCall : startRoomCall;
        startCall(room, {
          microphone: callPreferences.microphone,
          video: autoJoinIntent.video,
          sound: callPreferences.sound,
        });
        setAutoJoinIntent(null);
      }
    }
  }, [
    selectedRoomId,
    autoJoinIntent,
    setAutoJoinIntent,
    mx,
    mDirects,
    callPreferences.microphone,
    callPreferences.sound,
    startDirectCall,
    startRoomCall,
  ]);
}
