import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { useAtomValue } from 'jotai';
import { livekitJsCallAtom, livekitJsCallSoundAtom } from '$state/livekitJsCall';

/** Lives above the room route: the surface unmounts on navigation and takes its `<audio>` with it. */
export function LivekitJsCallAudio() {
  const call = useAtomValue(livekitJsCallAtom);
  const soundEnabled = useAtomValue(livekitJsCallSoundAtom);
  const room = call?.room;

  if (!room) return null;

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer muted={!soundEnabled} />
    </RoomContext.Provider>
  );
}
