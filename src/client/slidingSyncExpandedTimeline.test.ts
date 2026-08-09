import { describe, expect, it } from 'vitest';
import { SlidingSyncSdk } from 'matrix-js-sdk/lib/sliding-sync-sdk';
import type { MatrixClient, MSC3575RoomData, MSC3575SlidingSyncResponse } from '$types/matrix-sdk';
import type { Logger } from 'matrix-js-sdk/lib/logger';
import { createClient, EventTimeline } from '$types/matrix-sdk';
import { markExpandedTimelinesLimited } from './slidingSync';

// Drives the real matrix-js-sdk room-data path, pinning the SDK's actual behaviour
// rather than our assumptions about it.

const userId = '@me:example.com';
const roomId = '!dm:example.com';

type RoomDataHandler = (roomId: string, data: MSC3575RoomData) => Promise<void>;

const silentLogger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  getChild: () => silentLogger,
};

const makeSdk = (): { mx: MatrixClient; deliver: RoomDataHandler } => {
  const mx = createClient({ baseUrl: 'https://example.com', userId, accessToken: 'token' });

  let roomDataHandler: RoomDataHandler | undefined;
  const slidingSyncStub = {
    on: (event: string, handler: unknown) => {
      if (event === 'SlidingSync.RoomData') roomDataHandler = handler as RoomDataHandler;
    },
    registerExtension: () => {},
  };

  new SlidingSyncSdk(slidingSyncStub as never, mx, {}, { logger: silentLogger });
  if (!roomDataHandler) throw new Error('SlidingSyncSdk did not subscribe to room data');

  return { mx, deliver: roomDataHandler };
};

const message = (id: string, ts: number) => ({
  type: 'm.room.message',
  event_id: id,
  sender: '@them:example.com',
  origin_server_ts: ts,
  content: { msgtype: 'm.text', body: id },
});

/** What a list sends at timeline_limit: 1 the first time it sees a room. */
const initialRoomData = (newest: ReturnType<typeof message>): MSC3575RoomData =>
  ({
    initial: true,
    required_state: [],
    timeline: [newest],
    limited: true,
    prev_batch: 't1-0',
  }) as unknown as MSC3575RoomData;

/** What Synapse sends for a raised timeline_limit: history from the top of the
 *  room, `initial` and `limited` both unset. */
const expandedResponse = (timeline: ReturnType<typeof message>[]): MSC3575SlidingSyncResponse =>
  ({
    pos: 'p2',
    rooms: {
      [roomId]: {
        unstable_expanded_timeline: true,
        required_state: [],
        timeline,
        prev_batch: 't1-5',
      },
    },
  }) as unknown as MSC3575SlidingSyncResponse;

const timelineIds = (mx: MatrixClient): string[] =>
  mx
    .getRoom(roomId)!
    .getLiveTimeline()
    .getEvents()
    .map((event) => event.getId()!);

const history = [message('$e1', 100), message('$e2', 200), message('$e3', 300)];
const newest = history[history.length - 1]!;

describe('expanded timeline handling in matrix-js-sdk', () => {
  it('appends the expanded history out of order when only Synapse flags it', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    expect(timelineIds(mx)).toEqual(['$e3']);

    const resp = expandedResponse(history);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(timelineIds(mx)).toEqual(['$e3', '$e1', '$e2']);
  });

  it('reconciles the gap into a correctly ordered timeline once marked limited', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse(history);
    markExpandedTimelinesLimited(resp);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3']);
  });

  it('keeps a usable back-pagination token after reconciling', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse(history);
    markExpandedTimelinesLimited(resp);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(mx.getRoom(roomId)!.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS)).toBe(
      't1-5'
    );
  });
});
