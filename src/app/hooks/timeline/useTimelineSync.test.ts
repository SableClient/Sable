// Tests for useTimelineSync: focus on room-change timeline reset behavior
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimelineSync } from './useTimelineSync';
import { getInitialTimeline } from '$utils/timeline';

// Mock the dependencies
vi.mock('$hooks/useAlive', () => ({
  useAlive: () => () => true,
}));

vi.mock('$utils/notifications', () => ({
  markAsRead: vi.fn(),
}));

vi.mock('$utils/room', () => ({
  decryptAllTimelineEvent: vi.fn(),
}));

vi.mock('$utils/timeline', () => ({
  getInitialTimeline: vi.fn(),
  getEmptyTimeline: vi.fn(),
  getLinkedTimelines: vi.fn(() => []),
  getTimelinesEventsCount: vi.fn(() => 0),
  getEventIdAbsoluteIndex: vi.fn(),
  getLiveTimeline: vi.fn(),
  getRoomUnreadInfo: vi.fn(),
  PAGINATION_LIMIT: 30,
}));

vi.mock('$types/matrix-sdk', () => ({
  Direction: { Backward: 0, Forward: 1 },
}));

vi.mock('@sentry/react', () => ({
  startSpan: vi.fn((config, fn) => fn()),
  metrics: {
    distribution: vi.fn(),
  },
}));

// Create mock room and client
const createMockRoom = (roomId: string) => ({
  roomId,
  getUnfilteredTimelineSet: vi.fn(() => ({
    getTimelineForEvent: vi.fn(() => null),
  })),
});

const createMockClient = () => ({
  getUserId: vi.fn(() => '@user:example.com'),
});

describe('useTimelineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets timeline state when room.roomId changes and eventId is not set', () => {
    const room1 = createMockRoom('!room1:example.com');
    const room2 = createMockRoom('!room2:example.com');
    const mx = createMockClient();

    const mockTimeline = { linkedTimelines: [] };
    const getInitialTimelineMock = vi.mocked(getInitialTimeline);
    getInitialTimelineMock.mockReturnValue(mockTimeline);

    // Render with first room
    const { rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          mx,
          room,
          eventId,
        }),
      {
        initialProps: {
          room: room1,
          eventId: undefined,
        },
      }
    );

    // Verify initial timeline was set
    expect(getInitialTimelineMock).toHaveBeenCalledWith(room1);

    // Clear the mock to track new calls
    getInitialTimelineMock.mockClear();

    // Change to room2
    act(() => {
      rerender({ room: room2, eventId: undefined });
    });

    // Should reset timeline for the new room
    expect(getInitialTimelineMock).toHaveBeenCalledWith(room2);
  });

  it('does not reset timeline when eventId is set during room change', () => {
    const room1 = createMockRoom('!room1:example.com');
    const room2 = createMockRoom('!room2:example.com');
    const mx = createMockClient();

    const mockTimeline = { linkedTimelines: [] };
    const getInitialTimelineMock = vi.mocked(getInitialTimeline);
    getInitialTimelineMock.mockReturnValue(mockTimeline);

    // Render with first room
    const { rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          mx,
          room,
          eventId,
        }),
      {
        initialProps: {
          room: room1,
          eventId: undefined,
        },
      }
    );

    // Clear the mock to track new calls during room change
    getInitialTimelineMock.mockClear();

    // Change to room2 WITH eventId set (should NOT reset)
    act(() => {
      rerender({ room: room2, eventId: '$event123' });
    });

    // Should NOT reset timeline when eventId is set
    expect(getInitialTimelineMock).not.toHaveBeenCalledWith(room2);
  });

  it('does not reset timeline when room.roomId stays the same', () => {
    const room = createMockRoom('!room1:example.com');
    const mx = createMockClient();

    const mockTimeline = { linkedTimelines: [] };
    const getInitialTimelineMock = vi.mocked(getInitialTimeline);
    getInitialTimelineMock.mockReturnValue(mockTimeline);

    // Render hook
    const { rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          mx,
          room,
          eventId,
        }),
      {
        initialProps: {
          room,
          eventId: undefined,
        },
      }
    );

    // Clear the mock to track new calls
    getInitialTimelineMock.mockClear();

    // Rerender with same room (different prop but same roomId)
    const sameRoom = createMockRoom(room.roomId);
    act(() => {
      rerender({ room: sameRoom, eventId: undefined });
    });

    // Should NOT reset timeline since roomId is the same
    expect(getInitialTimelineMock).not.toHaveBeenCalledWith(sameRoom);
  });
});
