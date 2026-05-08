import { IconButton, Icon, Icons, TooltipProvider, Tooltip, Text } from 'folds';
import { useAtomValue } from 'jotai';
import type { Room, TimelineEvents } from '$types/matrix-sdk';
import { useCallStart, useCallJoined } from '$hooks/useCallEmbed';
import { callEmbedAtom } from '$state/callEmbed';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useCallPreferences } from '$state/hooks/callPreferences';

interface RoomCallButtonProps {
  room: Room;
}

export function RoomCallButton({ room }: RoomCallButtonProps) {
  const startCall = useCallStart();
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);
  const mx = useMatrixClient();
  const { microphone, video, sound } = useCallPreferences();

  const isJoinedInThisRoom = joined && callEmbed?.roomId === room.roomId;

  if (isJoinedInThisRoom) return null;

  const handleStartCall = async () => {
    startCall(room, { microphone, video, sound });
    try {
      const now = Date.now();
      // org.matrix.msc4075.rtc.notification is not yet in the SDK's TimelineEvents union;
      // cast to keyof TimelineEvents to satisfy sendEvent's overload until MSC4075 lands.
      await mx.sendEvent(
        room.roomId,
        'org.matrix.msc4075.rtc.notification' as keyof TimelineEvents,
        {
          notification_type: 'ring',
          sender_ts: now,
          lifetime: 30000,
          'm.mentions': {
            room: true,
          },
          application: 'm.call',
          call_id: room.roomId,
          'm.text': [
            {
              body: `Call started by ${mx.getUser(mx.getSafeUserId())?.displayName || 'User'} 🎶`,
            },
          ],
        } as unknown as TimelineEvents[keyof TimelineEvents]
      );
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
