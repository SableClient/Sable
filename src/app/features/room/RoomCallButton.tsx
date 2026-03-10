import { IconButton, Icon, Icons, TooltipProvider, Tooltip, Text } from 'folds';
import { useAtomValue } from 'jotai';
import { Room } from '$types/matrix-sdk';
import { useCallStart, useCallJoined } from '$hooks/useCallEmbed';
import { callEmbedAtom } from '$state/callEmbed';
import { useMatrixClient } from '$hooks/useMatrixClient';

interface RoomCallButtonProps {
  room: Room;
}

export function RoomCallButton({ room }: RoomCallButtonProps) {
  const startCall = useCallStart();
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);
  const mx = useMatrixClient();

  const isJoinedInThisRoom = joined && callEmbed?.roomId === room.roomId;

  if (isJoinedInThisRoom) return null;

  const handleStartCall = async () => {
    startCall(room);
    try {
      const now = Date.now();
      // TODO not use as any one day someday i swear
      await mx.sendEvent(room.roomId, 'org.matrix.msc4075.rtc.notification' as any, {
        notification_type: 'ring',
        sender_ts: now,
        lifetime: 30000,
        'm.mentions': {
          room: true,
        },
        application: 'm.call',
        call_id: room.roomId,
        'm.text': [
          { body: `Call started by ${mx.getUser(mx.getSafeUserId())?.displayName || 'User'} 🎶` },
        ],
      });
    } catch {
      /* skill issue block */
    }
  };

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
          onClick={handleStartCall}
          aria-label="Start Voice Call"
        >
          <Icon size="400" src={Icons.Phone} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}
