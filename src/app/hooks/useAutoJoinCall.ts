import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useCallStart } from '$hooks/useCallEmbed';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { autoJoinCallIntentAtom } from '$state/callEmbed';
import { mDirectAtom } from '$state/mDirectList';
import { useCallPreferences } from '$state/hooks/callPreferences';
import { useRoomNavigate } from '$hooks/useRoomNavigate';

export function useAutoJoinCall() {
  const mx = useMatrixClient();
  const selectedRoomId = useSelectedRoom();
  const [autoJoinIntent, setAutoJoinIntent] = useAtom(autoJoinCallIntentAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const callPreferences = useCallPreferences();
  const startDirectCall = useCallStart(true);
  const startRoomCall = useCallStart(false);
  const { navigateRoom } = useRoomNavigate();

  useEffect(() => {
    if (selectedRoomId && autoJoinIntent && selectedRoomId === autoJoinIntent.roomId) {
      const room = mx.getRoom(selectedRoomId);

      if (room) {
        const startCall = mDirects.has(room.roomId) ? startDirectCall : startRoomCall;
        startCall(room, {
          microphone: callPreferences.microphone,
          video: autoJoinIntent.video,
          sound: callPreferences.sound,
          audioDeviceId: callPreferences.audioDeviceId,
          videoDeviceId: callPreferences.videoDeviceId,
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
    callPreferences.audioDeviceId,
    callPreferences.videoDeviceId,
    startDirectCall,
    startRoomCall,
  ]);

  useEffect(() => {
    const answerFromSystemUi = (event: Event) => {
      const roomId = (event as CustomEvent<{ roomId?: unknown }>).detail?.roomId;
      if (typeof roomId !== 'string') return;
      const room = mx.getRoom(roomId);
      if (!room) return;
      setAutoJoinIntent({ roomId, video: false });
      navigateRoom(roomId);
    };
    window.addEventListener('nativeCallAnswer', answerFromSystemUi);
    return () => window.removeEventListener('nativeCallAnswer', answerFromSystemUi);
  }, [mx, setAutoJoinIntent, navigateRoom]);
}
