import type { Room } from '$types/matrix-sdk';
import { DuplicateStrategy, MatrixEvent } from '$types/matrix-sdk';

export function sendFeedback(msg: string, room: Room, userId: string) {
  const localNotice = new MatrixEvent({
    type: 'm.room.message',
    content: { msgtype: 'm.notice', body: msg },
    event_id: `~sable-feedback-${Date.now()}`,
    room_id: room.roomId,
    sender: userId,
  });
  room.addLiveEvents([localNotice], {
    duplicateStrategy: DuplicateStrategy.Ignore,
    addToState: false,
  });
}
