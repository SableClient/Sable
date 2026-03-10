import { IconButton, Icon, Icons, TooltipProvider, Tooltip, Text } from 'folds';
import { useAtomValue } from 'jotai';
import { Room } from '$types/matrix-sdk';
import { useCallStart, useCallJoined } from '$hooks/useCallEmbed';
import { callEmbedAtom } from '$state/callEmbed';

interface RoomCallButtonProps {
  room: Room;
}

export function RoomCallButton({ room }: RoomCallButtonProps) {
  const startCall = useCallStart();
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);

  const isJoinedInThisRoom = joined && callEmbed?.roomId === room.roomId;

  if (isJoinedInThisRoom) return null;

  return (
    <TooltipProvider
      position="Bottom"
      offset={4}
      tooltip={
        <Tooltip>
          <Text>Start Voice Call</Text>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <IconButton
          fill="None"
          ref={triggerRef}
          onClick={() => startCall(room)}
          aria-label="Start Voice Call"
        >
          <Icon size="400" src={Icons.Phone} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}
