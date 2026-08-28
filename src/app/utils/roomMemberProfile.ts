import type { MatrixClient, Room } from '$types/matrix-sdk';
import { EventType, MatrixEvent } from '$types/matrix-sdk';
import type { CustomRoomMemberEventContent } from '$unstable/CustomRoomMemberEventContent';

/** Send an own-membership profile update and immediately reflect the accepted state locally. */
export async function setOwnRoomMemberProfile(
  mx: MatrixClient,
  room: Room,
  content: CustomRoomMemberEventContent
): Promise<void> {
  const userId = mx.getSafeUserId();
  const response = await mx.sendStateEvent(room.roomId, EventType.RoomMember, content, userId);

  room.currentState.setStateEvents([
    new MatrixEvent({
      event_id: response.event_id,
      origin_server_ts: Date.now(),
      room_id: room.roomId,
      sender: userId,
      state_key: userId,
      type: EventType.RoomMember,
      content,
    }),
  ]);
}
