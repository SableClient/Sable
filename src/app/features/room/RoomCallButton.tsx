import { IconButton, TooltipProvider, Tooltip, Text } from 'folds';
import { composerIcon, Phone, VideoCamera } from '$components/icons/phosphor';
import { useAtomValue } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { useCallStart, useCallJoined } from '$hooks/useCallEmbed';
import type { CallPreferences } from '$state/callPreferences';
import { callEmbedAtom } from '$state/callEmbed';

interface RoomCallButtonProps {
  room: Room;
  direct: boolean;
  defaultPreferences: CallPreferences;
  kind: 'voice' | 'video';
  allowVideoStart?: boolean;
}

export function RoomCallButton({
  room,
  direct,
  defaultPreferences,
  kind,
  allowVideoStart = true,
}: RoomCallButtonProps) {
  const startCall = useCallStart(direct);
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);

  const isJoinedInThisRoom = joined && callEmbed?.roomId === room.roomId;
  const callStartingInThisRoom = !!callEmbed && callEmbed.roomId === room.roomId && !joined;
  const inAnotherCall = !!callEmbed && callEmbed.roomId !== room.roomId;
  const startDisabled = inAnotherCall || callStartingInThisRoom;
  const startingVideoCall = kind === 'video';

  if (kind === 'video' && !allowVideoStart) return null;
  if (isJoinedInThisRoom) return null;

  const startSelectedCall = () => {
    startCall(room, {
      microphone: defaultPreferences.microphone,
      video: startingVideoCall,
      sound: defaultPreferences.sound,
    });
  };

  const readyCopy = startingVideoCall ? 'Start Video Call' : 'Start Voice Call';
  const ariaLabel = startingVideoCall ? 'Start Video Call' : 'Start Voice Call';
  const icon = startingVideoCall ? VideoCamera : Phone;

  return (
    <TooltipProvider
      position="Bottom"
      offset={4}
      tooltip={
        <Tooltip>
          {inAnotherCall ? (
            <Text>Already in another call</Text>
          ) : callStartingInThisRoom ? (
            <Text>Call is starting</Text>
          ) : (
            <Text>{readyCopy}</Text>
          )}
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <IconButton
          fill="None"
          ref={triggerRef}
          onClick={startSelectedCall}
          disabled={startDisabled}
          aria-label={ariaLabel}
        >
          {composerIcon(icon)}
        </IconButton>
      )}
    </TooltipProvider>
  );
}
