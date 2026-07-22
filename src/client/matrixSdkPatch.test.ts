import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { MatrixEvent, Room } from '$types/matrix-sdk';

const roomId = '!room:example.com';
const parentEventId = '$missing-parent';

const makeRelationEvent = (): MatrixEvent =>
  new MatrixEvent({
    event_id: '$relation',
    room_id: roomId,
    sender: '@user:example.com',
    type: 'm.reaction',
    content: {
      'm.relates_to': {
        event_id: parentEventId,
        rel_type: 'm.annotation',
        key: '👍',
      },
    },
  });

const makeRoom = (fetchRoomEvent: MatrixClient['fetchRoomEvent']): Room => {
  const client = {
    fetchRoomEvent,
    supportsThreads: () => true,
  } as unknown as MatrixClient;
  return new Room(roomId, client, '@user:example.com');
};

describe('matrix-js-sdk Room.addLiveEvents patch', () => {
  it('skips unresolved relation-parent fetching from cache', async () => {
    const fetchRoomEvent = vi.fn<MatrixClient['fetchRoomEvent']>();
    const room = makeRoom(fetchRoomEvent);

    await room.addLiveEvents([makeRelationEvent()], { fromCache: true, addToState: false });

    expect(fetchRoomEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['fromCache false', { fromCache: false, addToState: false }],
    ['fromCache omitted', { addToState: false }],
  ])('fetches unresolved relation parents for live events (%s)', async (_label, options) => {
    const fetchRoomEvent = vi.fn<MatrixClient['fetchRoomEvent']>().mockResolvedValue({
      event_id: parentEventId,
      room_id: roomId,
      type: 'm.room.message',
    });
    const room = makeRoom(fetchRoomEvent);

    await room.addLiveEvents([makeRelationEvent()], options);

    expect(fetchRoomEvent).toHaveBeenCalledWith(roomId, parentEventId);
  });
});
