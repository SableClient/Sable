import { EventEmitter } from 'events';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { useTimelineSync } from './useTimelineSync';
import { getRoomUnreadInfo } from '$utils/timeline';
import type * as TimelineUtils from '$utils/timeline';

vi.mock('@sentry/react', () => ({
  default: {},
  startSpan: vi.fn<(_options: unknown, fn: () => Promise<unknown>) => Promise<unknown>>(),
  addBreadcrumb: vi.fn<() => void>(),
  captureMessage: vi.fn<(msg: string) => void>(),
  metrics: {
    distribution: vi.fn<() => void>(),
  },
}));

vi.mock('$utils/timeline', async (importOriginal) => {
  const actual = await importOriginal<typeof TimelineUtils>();
  return {
    ...actual,
    getRoomUnreadInfo: vi.fn<typeof TimelineUtils.getRoomUnreadInfo>(),
  };
});

vi.mock('$utils/notifications', () => ({
  markAsRead: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

type FakeTimeline = {
  getEvents: () => unknown[];
  getNeighbouringTimeline: () => undefined;
  getPaginationToken: () => undefined;
  getRoomId: () => string;
};

type FakeTimelineSet = EventEmitter & {
  getLiveTimeline: () => FakeTimeline;
  getTimelineForEvent: () => undefined;
};

type FakeRoom = Room &
  EventEmitter & {
    emit: EventEmitter['emit'];
  };

function createTimeline(events: unknown[] = [{}]): FakeTimeline {
  return {
    getEvents: () => events,
    getNeighbouringTimeline: () => undefined,
    getPaginationToken: () => undefined,
    getRoomId: () => '!room:test',
  };
}

function createRoom(
  roomId = '!room:test',
  events: unknown[] = [{}]
): {
  room: FakeRoom;
  timelineSet: FakeTimelineSet;
  events: unknown[];
  timeline: FakeTimeline;
} {
  const timeline = {
    ...createTimeline(events),
    getRoomId: () => roomId,
  };
  const timelineSet = new EventEmitter() as FakeTimelineSet;
  timelineSet.getLiveTimeline = () => timeline;
  timelineSet.getTimelineForEvent = () => undefined;

  const roomEmitter = new EventEmitter();
  const room = {
    on: roomEmitter.on.bind(roomEmitter),
    removeListener: roomEmitter.removeListener.bind(roomEmitter),
    emit: roomEmitter.emit.bind(roomEmitter),
    roomId,
    getUnfilteredTimelineSet: () => timelineSet as never,
    getEventReadUpTo: () => null,
    getThread: () => null,
    getLiveTimeline: () => timeline,
    getUnreadNotificationCount: () => 0,
    getMyMembership: () => 'join',
    getMember: () => null,
    hasEncryptionStateEvent: () => false,
    client: {
      getUserId: () => '@alice:test',
    },
  } as unknown as FakeRoom;

  return { room, timelineSet, events, timeline };
}

function makeEvent(sender: string, roomId: string) {
  return {
    threadRootId: undefined,
    getSender: () => sender,
    getRoomId: () => roomId,
    getTs: () => Date.now(),
    getRelation: () => undefined,
  };
}

function emitLiveTimelineEvent(
  room: FakeRoom,
  timeline: FakeTimeline,
  events: unknown[],
  sender: string
) {
  events.push({});
  room.emit(RoomEvent.Timeline, makeEvent(sender, room.roomId), room, false, false, {
    liveEvent: true,
    timeline,
  });
}

describe('useTimelineSync', () => {
  it('does not snap a non-bottom user to latest after TimelineReset', async () => {
    const { room, timelineSet, events } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.LocalEchoUpdated, {}, room);
      await Promise.resolve();
    });

    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('keeps a bottom-pinned user anchored after TimelineReset', async () => {
    const { room, timelineSet } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
        isAtBottom: true,
        isAtBottomRef: { current: true },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('resets timeline state when room.roomId changes and eventId is not set', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: { getUserId: () => '@alice:test' } as never,
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      {
        initialProps: {
          room: roomOne.room as Room,
          eventId: undefined as string | undefined,
        },
      }
    );

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomOne.timelineSet.getLiveTimeline());

    await act(async () => {
      rerender({ room: roomTwo.room as Room, eventId: undefined });
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomTwo.timelineSet.getLiveTimeline());
  });

  it('does not reset timeline when eventId is set during a room change', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: { getUserId: () => '@alice:test' } as never,
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      {
        initialProps: {
          room: roomOne.room as Room,
          eventId: undefined as string | undefined,
        },
      }
    );

    await act(async () => {
      rerender({ room: roomTwo.room as Room, eventId: '$event:one' });
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomOne.timelineSet.getLiveTimeline());
  });

  it('does not reset timeline when the roomId stays the same', async () => {
    const roomOne = createRoom('!room:one');
    const sameRoomId = createRoom('!room:one');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room }) =>
        useTimelineSync({
          room,
          mx: { getUserId: () => '@alice:test' } as never,
          eventId: undefined,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      {
        initialProps: {
          room: roomOne.room as Room,
        },
      }
    );

    await act(async () => {
      rerender({ room: sameRoomId.room as Room });
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomOne.timelineSet.getLiveTimeline());
  });

  describe('auto-follow on live message', () => {
    it('scrolls to bottom with smooth behavior for an incoming message from another user', async () => {
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await Promise.resolve();
      });

      expect(scrollToBottom).toHaveBeenCalledWith('smooth');
      hasFocus.mockRestore();
    });

    it('scrolls to bottom with instant behavior for an own message', async () => {
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@alice:test');
        await Promise.resolve();
      });

      expect(scrollToBottom).toHaveBeenCalledWith('instant');
    });

    it('keeps following instantly and re-anchors the unread divider while unfocused', async () => {
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      const unread = { readUptoEventId: '$read:test', inLiveTimeline: true, scrollTo: false };
      vi.mocked(getRoomUnreadInfo).mockReturnValueOnce(unread);
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();
      const setUnreadInfo = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo,
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await Promise.resolve();
      });

      expect(setUnreadInfo).toHaveBeenCalledWith(unread);
      expect(scrollToBottom).toHaveBeenCalledWith('instant');
      hasFocus.mockRestore();
    });

    it('does not scroll when the user is not at the bottom', async () => {
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await Promise.resolve();
      });

      expect(scrollToBottom).not.toHaveBeenCalled();
    });

    it('ignores non-live (historical) timeline events', async () => {
      const { room, timeline } = createRoom();
      const scrollToBottom = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      const mEvent = makeEvent('@bob:test', room.roomId);
      await act(async () => {
        room.emit(RoomEvent.Timeline, mEvent, room, true, false, {
          liveEvent: false,
          timeline,
        });
        await Promise.resolve();
      });

      expect(scrollToBottom).not.toHaveBeenCalled();
    });

    it('ignores thread reply events', async () => {
      const { room, timeline } = createRoom();
      const scrollToBottom = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      const mEvent = {
        threadRootId: '$thread-root:test',
        getSender: () => '@bob:test',
        getRoomId: () => room.roomId,
        getTs: () => Date.now(),
      };
      await act(async () => {
        room.emit(RoomEvent.Timeline, mEvent, room, false, false, {
          liveEvent: true,
          timeline,
        });
        await Promise.resolve();
      });

      expect(scrollToBottom).not.toHaveBeenCalled();
    });
  });
});
