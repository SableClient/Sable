import { describe, expect, it } from 'vitest';
import type { IEventWithRoomId } from '$types/matrix-sdk';
import type { ResultGroup } from './useMessageSearch';
import { flattenTimelineSearchItems, isGroupedSearchView } from './searchView';

const makeGroup = (
  roomId: string,
  events: Array<{ id: string; ts: number; rank?: number }>
): ResultGroup => ({
  roomId,
  items: events.map(({ id, ts, rank = 1 }) => ({
    rank,
    event: {
      event_id: id,
      room_id: roomId,
      origin_server_ts: ts,
    } as IEventWithRoomId,
    context: { events_before: [], events_after: [], profile_info: {} },
  })),
});

describe('isGroupedSearchView', () => {
  it('defaults missing grouped params to timeline view', () => {
    expect(isGroupedSearchView(undefined)).toBe(false);
  });

  it('enables grouped mode only for explicit grouped=true', () => {
    expect(isGroupedSearchView('true')).toBe(true);
    expect(isGroupedSearchView('false')).toBe(false);
  });
});

describe('flattenTimelineSearchItems', () => {
  it('sorts recent timeline items globally across rooms', () => {
    const items = flattenTimelineSearchItems(
      [
        makeGroup('!room-a:example.org', [
          { id: '$a-new', ts: 3000 },
          { id: '$a-old', ts: 1000 },
        ]),
        makeGroup('!room-b:example.org', [{ id: '$b-mid', ts: 2000 }]),
      ],
      'recent'
    );

    expect(items.map((item) => item.event.event_id)).toEqual(['$a-new', '$b-mid', '$a-old']);
  });

  it('keeps existing flat order for rank sorting', () => {
    const items = flattenTimelineSearchItems(
      [
        makeGroup('!room-a:example.org', [{ id: '$a', ts: 1000, rank: 0.9 }]),
        makeGroup('!room-b:example.org', [{ id: '$b', ts: 3000, rank: 0.1 }]),
      ],
      'rank'
    );

    expect(items.map((item) => item.event.event_id)).toEqual(['$a', '$b']);
  });
});
