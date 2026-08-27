import { describe, expect, it, vi } from 'vitest';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { CustomStateEvent } from '$types/matrix/room';
import { getImagePackStateEventTypes, getRoomImagePacks } from './utils';

type TestRoom = Room & { packEvents: Record<string, MatrixEvent[]> };

vi.mock('$utils/room/hierarchy', () => ({
  getAccountData: vi.fn<() => undefined>(),
  getStateEvent: (room: TestRoom, type: string, stateKey: string) =>
    room.packEvents[type]?.find((event) => event.getStateKey() === stateKey),
  getStateEvents: (room: TestRoom, type: string) => room.packEvents[type] ?? [],
}));

const packEvent = (id: string, content: object): MatrixEvent =>
  ({
    getId: () => id,
    getRoomId: () => '!packs:example.org',
    getStateKey: () => 'pack',
    getContent: () => content,
  }) as MatrixEvent;

describe('legacy image pack compatibility', () => {
  it('merges legacy additions and keeps the legacy key updated', () => {
    const room = {
      roomId: '!packs:example.org',
      packEvents: {
        [CustomStateEvent.ImagePack]: [
          packEvent('$stable', {
            pack: { display_name: 'Stable name' },
            images: { stable: { url: 'mxc://example.org/stable' } },
          }),
        ],
        [CustomStateEvent.PoniesRoomEmotes]: [
          packEvent('$legacy', {
            images: { addedByLegacyClient: { url: 'mxc://example.org/legacy' } },
          }),
        ],
      },
    } as unknown as TestRoom;

    const [pack] = getRoomImagePacks(room);
    expect(Array.from(pack?.images.collection.keys() ?? [])).toEqual([
      'addedByLegacyClient',
      'stable',
    ]);
    expect(getImagePackStateEventTypes(room, 'pack')).toEqual([
      CustomStateEvent.ImagePack,
      CustomStateEvent.PoniesRoomEmotes,
    ]);
  });
});
