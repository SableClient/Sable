import { MatrixEvent, Room } from 'matrix-js-sdk';

export function sendFeedback(msg: string, room: Room, userId: string) {
  const localNotice = new MatrixEvent({
    type: 'm.room.message',
    content: { msgtype: 'm.notice', body: msg },
    event_id: `~sable-feedback-${Date.now()}`,
    room_id: room.roomId,
    sender: userId,
  });
  room.addLiveEvents([localNotice], { duplicateStrategy: 'ignore' } as any);
}
