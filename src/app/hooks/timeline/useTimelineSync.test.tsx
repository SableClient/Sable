import { EventEmitter } from 'events';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { useTimelineSync } from './useTimelineSync';

vi.mock('@sentry/react', () => ({
  default: {},
  startSpan: vi.fn<(_options: unknown, fn: () => Promise<unknown>) => Promise<unknown>>(),
  addBreadcrumb: vi.fn<() => void>(),
  captureMessage: vi.fn<(msg: string) => void>(),
  metrics: {
    distribution: vi.fn<() => void>(),
  },
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
    client: {
      getUserId: () => '@alice:test',
    },
  } as unknown as FakeRoom;

  return { room, timelineSet, events };
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
});
