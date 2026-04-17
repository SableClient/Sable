import type { Room } from 'matrix-js-sdk';
import { MatrixEvent } from 'matrix-js-sdk';

export function sendFeedback(msg: string, room: Room, userId: string) {
  const localNotice = new MatrixEvent({
    type: 'm.room_message',
    content: { msgtype: 'm.notice', body: msg },
    event_id: `~sable-feedback-${Date.now()}`,
    room_id: room.roomId,
    sender: userId,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room.addLiveEvents([localNotice], { duplicateStrategy: 'ignore' } as any);
}
