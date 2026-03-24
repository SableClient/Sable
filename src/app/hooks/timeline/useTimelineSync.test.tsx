import { EventEmitter } from 'events';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type Room, RoomEvent } from '$types/matrix-sdk';
import { useTimelineSync } from './useTimelineSync';

vi.mock('@sentry/react', () => ({
  default: {},
  startSpan: async (_options: unknown, fn: () => Promise<unknown>) => fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  metrics: {
    distribution: vi.fn(),
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

function createRoom(events: unknown[] = [{}]): {
  room: FakeRoom;
  timelineSet: FakeTimelineSet;
  events: unknown[];
} {
  const timeline = createTimeline(events);
  const timelineSet = new EventEmitter() as FakeTimelineSet;
  timelineSet.getLiveTimeline = () => timeline;
  timelineSet.getTimelineForEvent = () => undefined;

  const roomEmitter = new EventEmitter();
  const room = {
    on: roomEmitter.on.bind(roomEmitter),
    removeListener: roomEmitter.removeListener.bind(roomEmitter),
    emit: roomEmitter.emit.bind(roomEmitter),
    roomId: '!room:test',
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
    const scrollToBottom = vi.fn();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn(),
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
    const scrollToBottom = vi.fn();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
        isAtBottom: true,
        isAtBottomRef: { current: true },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn(),
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
});
