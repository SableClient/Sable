import { EventEmitter } from 'events';
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ProseMirrorEditorController as Editor } from '$components/editor/prosemirrorController';
import type { Room } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import type * as DomUtils from '$utils/dom';
import { RoomTimeline } from './RoomTimeline';

const {
  vListHandle,
  timelineSync,
  setUnreadTimelineMock,
  getRoomUnreadInfoMock,
  rendererCtxPermissions,
  rendererCtxSettings,
  processedTimelineOptions,
  processedRowsVisible,
  processedRowIds,
  windowFocused,
  rowItemIndex,
  rowRenders,
  eventRedacted,
  unrenderedJumpTarget,
  liveTimeline,
  eventTimeline,
  navigateRoomMock,
  vListProps,
  timelineSyncOptions,
  timelineActionsOptions,
  showToastMock,
  markAsReadMock,
  readMarkerInLiveTimeline,
} = vi.hoisted(() => ({
  vListHandle: {
    scrollSize: 1000,
    scrollOffset: 0,
    viewportSize: 600,
    scrollToIndex: vi.fn<() => void>(),
    scrollTo: vi.fn<() => void>(),
    getItemOffset: () => 0,
    getItemSize: () => 100,
    findItemIndex: () => 0,
  },
  timelineSync: {
    eventsLength: 1,
    timeline: { linkedTimelines: [] },
    liveTimelineLinked: true,
    backwardStatus: 'idle',
    forwardStatus: 'idle',
    canPaginateBack: false,
    canPaginateForward: false,
    backwardError: false,
    forwardError: false,
    jumpFailed: false,
    focusItem: undefined as { eventId: string; scrollTo: boolean; highlight: boolean } | undefined,
    setFocusItem: vi.fn<() => void>(),
    loadEventTimeline: vi.fn<() => void>(),
    cancelEventTimelineLoad: vi.fn<() => void>(),
    focusLiveTimeline: vi.fn<() => void>(),
    handleTimelinePagination: vi.fn<() => void>(),
  },
  setUnreadTimelineMock: vi.fn<() => void>(),
  getRoomUnreadInfoMock: vi
    .fn<() => { readUptoEventId: string; inLiveTimeline: boolean; scrollTo: boolean } | undefined>()
    .mockReturnValue(undefined),
  rendererCtxPermissions: { canRedact: false },
  rendererCtxSettings: { hideReads: false },
  processedTimelineOptions: {
    current: undefined as Record<string, unknown> | undefined,
  },
  processedRowsVisible: { current: true },
  processedRowIds: { current: ['$evt1'] as string[] },
  windowFocused: { current: false },
  rowItemIndex: { current: 0 },
  rowRenders: { count: 0 },
  eventRedacted: { current: false },
  unrenderedJumpTarget: {
    current: undefined as { eventId: string; rawIndex: number } | undefined,
  },
  liveTimeline: {
    getState: () => undefined,
    getEvents: () => [{ getId: () => '$evt1' }] as unknown[],
  },
  eventTimeline: { current: undefined as object | undefined },
  navigateRoomMock: vi.fn<() => void>(),
  vListProps: { shift: false, shiftValues: [] as boolean[] },
  timelineSyncOptions: { current: undefined as Record<string, unknown> | undefined },
  timelineActionsOptions: { current: undefined as Record<string, unknown> | undefined },
  showToastMock: vi.fn<(text: string) => void>(),
  markAsReadMock: vi.fn<() => void>(),
  readMarkerInLiveTimeline: { current: false },
}));

let lastOnScroll: ((offset: number) => void) | undefined;
let lastOnScrollEnd: (() => void) | undefined;

vi.mock('virtua', () => ({
  VList: forwardRef(function MockVList(
    {
      data,
      children,
      onScroll,
      onScrollEnd,
      shift,
    }: {
      data: unknown[];
      children: (item: unknown, index: number) => ReactNode;
      onScroll?: (offset: number) => void;
      onScrollEnd?: () => void;
      shift?: boolean;
    },
    ref
  ) {
    lastOnScroll = onScroll;
    lastOnScrollEnd = onScrollEnd;
    vListProps.shift = shift ?? false;
    vListProps.shiftValues.push(vListProps.shift);
    useImperativeHandle(ref, () => vListHandle);
    return (
      // Outer element is the VList scroll container (messageListRef's first
      // child); inner element is the content element the fix observes.
      <div data-testid="vlist-scroll">
        <div data-testid="vlist-content">{data.map((item, index) => children(item, index))}</div>
      </div>
    );
  }),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getUserId: () => '@me:example.org',
    pushProcessor: undefined,
  }),
}));

vi.mock('$hooks/useAlive', () => ({ useAlive: () => true }));

vi.mock('$hooks/useRoom', () => ({ useIsInactivePanel: () => false }));

vi.mock('$hooks/useSlidingSyncActiveRoom', () => ({
  useSlidingSyncRoomLoading: () => false,
}));

vi.mock('$hooks/useMessageEdit', () => ({
  useMessageEdit: () => ({ editId: undefined, handleEdit: vi.fn<() => void>() }),
}));

vi.mock('$hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({ navigateRoom: navigateRoomMock }),
}));

vi.mock('$state/toast', () => ({ showToast: showToastMock }));

vi.mock('$hooks/useSpace', () => ({ useSpaceOptionally: () => undefined }));

vi.mock('$hooks/useIgnoredUsers', () => ({ useIgnoredUsers: () => [] }));

vi.mock('$hooks/useImagePackRooms', () => ({ useImagePackRooms: () => [] }));

vi.mock('$state/hooks/userRoomProfile', () => ({
  useOpenUserRoomProfile: () => vi.fn<() => void>(),
}));

vi.mock('$hooks/timeline/useTimelineSync', () => ({
  useTimelineSync: (options: Record<string, unknown>) => {
    timelineSyncOptions.current = options;
    return {
      ...timelineSync,
      setUnreadInfo: setUnreadTimelineMock,
    };
  },
}));

vi.mock('$hooks/timeline/useTimelineActions', () => ({
  useTimelineActions: (options: Record<string, unknown>) => {
    timelineActionsOptions.current = options;
    return {
      handleUserClick: vi.fn<() => void>(),
      handleUsernameClick: vi.fn<() => void>(),
      handleReplyClick: vi.fn<() => void>(),
      handleReactionToggle: vi.fn<() => void>(),
      handleEdit: vi.fn<() => void>(),
      handleResend: vi.fn<() => void>(),
      handleDeleteFailedSend: vi.fn<() => void>(),
      handleOpenReply: vi.fn<() => void>(),
      setOpenThread: vi.fn<() => void>(),
    };
  },
}));

vi.mock('$hooks/timeline/useProcessedTimeline', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const fakeEvent: ProcessedEvent = {
    id: '$evt1',
    itemIndex: 0,
    collapsed: false,
    willRenderNewDivider: false,
    willRenderDayDivider: false,
    mEvent: {
      getType: () => 'm.room.message',
      getStateKey: () => undefined,
      getTs: () => Date.now(),
      getSender: () => '@me:example.org',
      getId: () => '$evt1',
      isRedacted: () => eventRedacted.current,
    },
    timelineSet: undefined,
    eventSender: '@me:example.org',
    isRedacted: eventRedacted.current,
    editId: undefined,
    reactionsKey: '',
    content: undefined,
  } as unknown as ProcessedEvent;
  const eventsById = new Map<string, ProcessedEvent>([['$evt1', fakeEvent]]);
  const rowFor = (id: string, index: number): ProcessedEvent => {
    const existing = eventsById.get(id);
    if (existing) return existing;
    const row = {
      ...fakeEvent,
      id,
      itemIndex: index,
      mEvent: {
        getType: () => 'm.room.message',
        getStateKey: () => undefined,
        getTs: () => Date.now(),
        getSender: () => '@me:example.org',
        getId: () => id,
        isRedacted: () => false,
      },
    } as unknown as ProcessedEvent;
    eventsById.set(id, row);
    return row;
  };
  return {
    ...actual,
    useProcessedTimeline: (options: Record<string, unknown>) => {
      processedTimelineOptions.current = options;
      fakeEvent.itemIndex = rowItemIndex.current;
      fakeEvent.isRedacted = eventRedacted.current;
      return !processedRowsVisible.current || (options.items as number[]).length === 0
        ? []
        : processedRowIds.current.map(rowFor);
    },
  };
});

vi.mock('$hooks/timeline/useTimelineEventRenderer', () => {
  // Stable identity like useMatrixEventRenderer's ref dispatch: the row memo,
  // not this callback, is what has to notice a change.
  const renderMatrixEvent = () => {
    rowRenders.count += 1;
    return `canRedact:${rendererCtxPermissions.canRedact} hideReads:${rendererCtxSettings.hideReads}`;
  };
  return {
    useTimelineEventRenderer: () => renderMatrixEvent,
  };
});

vi.mock('$hooks/timeline/useTimelineRendererContext', () => {
  let settings = {
    hiddenEvents: {},
    messageLayout: 0,
    messageSpacing: '300',
    hideReads: false,
    hideMembershipEvents: false,
    hideNickAvatarEvents: false,
    hideMemberInReadOnly: false,
  };
  // New identity only when a value changes, like the real memoized context.
  const currentSettings = () => {
    if (settings.hideReads !== rendererCtxSettings.hideReads) {
      settings = { ...settings, hideReads: rendererCtxSettings.hideReads };
    }
    return settings;
  };
  return {
    useTimelineRendererContext: () => ({
      settings: currentSettings(),
      linkifyOpts: {},
      htmlReactParserOptions: {},
      permissions: {
        canRedact: rendererCtxPermissions.canRedact,
        canDeleteOwn: false,
        canSendReaction: false,
        canPinEvent: false,
        isReadOnly: false,
        getMemberPowerTag: vi.fn<() => void>(),
        parseMemberEvent: vi.fn<() => void>(),
      },
    }),
  };
});

vi.mock('$components/room-intro', () => ({ RoomIntro: () => null }));

vi.mock('$utils/timeline', () => ({
  getRoomUnreadInfo: () => getRoomUnreadInfoMock(),
  getEventTimeline: (_room: unknown, eventId: string) =>
    unrenderedJumpTarget.current?.eventId === eventId ? {} : eventTimeline.current,
  getDisplayedEventTimeline: (_linkedTimelines: unknown, eventId: string) =>
    unrenderedJumpTarget.current?.eventId === eventId ? {} : eventTimeline.current,
  getFirstLinkedTimeline: () => (readMarkerInLiveTimeline.current ? liveTimeline : undefined),
  getInitialTimeline: () => undefined,
  getEventIdAbsoluteIndex: () => unrenderedJumpTarget.current?.rawIndex,
  isNewestLiveEvent: (
    room: { getLiveTimeline: () => { getEvents?: () => { getId?: () => string }[] } },
    id: string
  ) => {
    const events = room.getLiveTimeline().getEvents?.() ?? [];
    return events[events.length - 1]?.getId?.() === id;
  },
}));

vi.mock('$utils/notifications', () => ({ markAsRead: markAsReadMock }));

vi.mock('$utils/dom', async (importOriginal) => {
  const actual = await importOriginal<typeof DomUtils>();
  return { ...actual, isWindowFocused: () => windowFocused.current };
});

type ObserverEntry = { callback: ResizeObserverCallback; elements: Set<Element> };

const observers: ObserverEntry[] = [];

function ResizeObserverStub(this: unknown, callback: ResizeObserverCallback) {
  const entry: ObserverEntry = { callback, elements: new Set() };
  observers.push(entry);
  return {
    observe: (el: Element) => entry.elements.add(el),
    unobserve: (el: Element) => entry.elements.delete(el),
    disconnect: () => entry.elements.clear(),
  };
}

const nativeResizeObserver = globalThis.ResizeObserver;

const fireResize = (element: Element, height = 1) => {
  observers.forEach(({ callback, elements }) => {
    if (!elements.has(element)) return;
    callback(
      [{ target: element, contentRect: { height } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver
    );
  });
};

const roomEmitter = new EventEmitter();
const room = {
  roomId: '!room:example.org',
  getLiveTimeline: () => liveTimeline,
  findEventById: () => undefined,
  on: roomEmitter.on.bind(roomEmitter),
  removeListener: roomEmitter.removeListener.bind(roomEmitter),
} as unknown as Room;

const emitReceiptFor = (userId: string) =>
  roomEmitter.emit(
    RoomEvent.Receipt,
    { getContent: () => ({ '$evt:example.org': { 'm.read': { [userId]: { ts: 1 } } } }) },
    room
  );

const getContentEl = (container: HTMLElement) => {
  const contentEl = container.querySelector('[data-testid="vlist-content"]');
  expect(contentEl).toBeTruthy();
  return contentEl as Element;
};

const getScrollEl = (container: HTMLElement) => {
  const scrollEl = container.querySelector('[data-testid="vlist-scroll"]');
  expect(scrollEl).toBeTruthy();
  return scrollEl as Element;
};

const getViewportEl = (container: HTMLElement) => {
  const scrollEl = container.querySelector('[data-testid="vlist-scroll"]');
  expect(scrollEl).toBeTruthy();
  return scrollEl!.parentElement as Element;
};

const renderTimeline = () => render(<RoomTimeline room={room} editor={{} as Editor} />);
const settleInitialScroll = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

beforeEach(() => {
  getRoomUnreadInfoMock.mockReset();
  rendererCtxPermissions.canRedact = false;
  rendererCtxSettings.hideReads = false;
  processedTimelineOptions.current = undefined;
  timelineSyncOptions.current = undefined;
  timelineActionsOptions.current = undefined;
  processedRowsVisible.current = true;
  processedRowIds.current = ['$evt1'];
  windowFocused.current = false;
  rowItemIndex.current = 0;
  rowRenders.count = 0;
  eventRedacted.current = false;
  unrenderedJumpTarget.current = undefined;
  eventTimeline.current = liveTimeline;
  liveTimeline.getEvents = () => [{ getId: () => '$evt1' }];
  navigateRoomMock.mockReset();
  showToastMock.mockReset();
  markAsReadMock.mockReset();
  readMarkerInLiveTimeline.current = false;
  vListProps.shift = false;
  vListProps.shiftValues.length = 0;
  timelineSync.eventsLength = 1;
  timelineSync.focusItem = undefined;
  timelineSync.canPaginateBack = false;
  timelineSync.canPaginateForward = false;
  timelineSync.liveTimelineLinked = true;
  timelineSync.jumpFailed = false;
  timelineSync.backwardStatus = 'idle';
  timelineSync.backwardError = false;
  timelineSync.forwardError = false;
  timelineSync.forwardStatus = 'idle';
  (timelineSync.handleTimelinePagination as ReturnType<typeof vi.fn>).mockReset();
  (timelineSync.cancelEventTimelineLoad as ReturnType<typeof vi.fn>).mockReset();
  (timelineSync.loadEventTimeline as ReturnType<typeof vi.fn>).mockReset();
  (timelineSync.focusLiveTimeline as ReturnType<typeof vi.fn>).mockReset();
});

describe('RoomTimeline content ResizeObserver', () => {
  beforeEach(() => {
    observers.length = 0;
    lastOnScroll = undefined;
    lastOnScrollEnd = undefined;
    vListHandle.scrollSize = 1000;
    vListHandle.scrollOffset = 0;
    vListHandle.viewportSize = 600;
    vListHandle.scrollToIndex.mockReset();
    vListHandle.scrollTo.mockReset();
    timelineSync.focusItem = undefined;
    (timelineSync.setFocusItem as ReturnType<typeof vi.fn>).mockReset();
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = nativeResizeObserver;
  });

  it('re-pins to the bottom when the VList content grows while pinned and live', async () => {
    const { container } = renderTimeline();

    // Let the mount-time initial scroll and its 80ms timer settle, then
    // isolate the content-resize behavior.
    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    const contentEl = getContentEl(container);
    act(() => fireResize(contentEl));

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'end' })
    );
  });

  it('re-pins to the bottom when the timeline viewport shrinks while pinned and live', async () => {
    const { container } = renderTimeline();

    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    // Pinned: the view ends exactly at the content bottom (1000 - 400 - 600 = 0).
    vListHandle.scrollOffset = 400;
    act(() => lastOnScroll?.(400));

    // A growing composer shrinks the timeline viewport (600 -> 578).
    const timeline = container.querySelector('[data-testid="timeline"]');
    expect(timeline).toBeTruthy();
    act(() => fireResize(timeline!, 600));
    act(() => fireResize(timeline!, 578));

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'end' })
    );
  });

  it('does not re-pin on content growth after scrolling off the bottom', async () => {
    const { container } = renderTimeline();

    await settleInitialScroll();

    // Scroll far off the bottom: scrollSize - offset - viewportSize >= 100.
    act(() => lastOnScroll?.(0));
    vListHandle.scrollToIndex.mockClear();

    const contentEl = getContentEl(container);
    act(() => fireResize(contentEl));

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });

  it('cancels the delayed initial bottom scroll when the user scrolls up', async () => {
    const { container } = renderTimeline();
    vListHandle.scrollToIndex.mockClear();

    act(() => {
      getScrollEl(container).dispatchEvent(new Event('wheel', { bubbles: true }));
      lastOnScroll?.(0);
    });
    await settleInitialScroll();

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does not cancel the delayed initial bottom scroll for a Virtua scroll callback', async () => {
    renderTimeline();
    vListHandle.scrollToIndex.mockClear();

    act(() => lastOnScroll?.(0));
    await settleInitialScroll();

    expect(vListHandle.scrollToIndex).toHaveBeenCalled();
  });

  it('does not treat a pointer press as an initial timeline scroll', async () => {
    const { container } = renderTimeline();
    vListHandle.scrollToIndex.mockClear();

    act(() => {
      getScrollEl(container).dispatchEvent(new Event('pointerdown', { bubbles: true }));
      lastOnScroll?.(0);
    });
    await settleInitialScroll();

    expect(vListHandle.scrollToIndex).toHaveBeenCalled();
  });

  it('resolves a jump target by event id, not by raw timeline index', async () => {
    timelineSync.liveTimelineLinked = false;
    const { rerender } = renderTimeline();

    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    rowItemIndex.current = 9;
    timelineSync.focusItem = { eventId: '$evt1', scrollTo: true, highlight: true };
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'center' })
    );
  });

  it('treats a jump to the final live row as latest', async () => {
    const { rerender, queryByText } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    timelineSync.focusItem = { eventId: '$evt1', scrollTo: true, highlight: true };
    rerender(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'end' })
    );
    expect(queryByText('Jump to Latest')).toBeNull();
    expect(navigateRoomMock).toHaveBeenCalledWith(room.roomId, undefined, { replace: true });
  });

  it('does not treat the final rendered row from a historical timeline as latest', async () => {
    eventTimeline.current = {};
    const { rerender, getByText } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    timelineSync.focusItem = { eventId: '$evt1', scrollTo: true, highlight: true };
    rerender(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'center' })
    );
    expect(getByText('Jump to Latest')).toBeTruthy();
    expect(navigateRoomMock).not.toHaveBeenCalled();
  });

  it('does not treat a jump target as latest while the room has newer events', async () => {
    eventTimeline.current = liveTimeline;
    timelineSync.liveTimelineLinked = true;
    (liveTimeline as unknown as { getEvents: () => { getId: () => string }[] }).getEvents = () => [
      { getId: () => '$evt1' },
      { getId: () => '$newer' },
    ];

    const { rerender, getByText } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    timelineSync.focusItem = { eventId: '$evt1', scrollTo: true, highlight: true };
    rerender(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'center' })
    );
    expect(navigateRoomMock).not.toHaveBeenCalled();
    expect(getByText('Jump to Latest')).toBeTruthy();
  });

  it('shifts the virtual list when rendered history prepends', async () => {
    timelineSync.liveTimelineLinked = false;
    const { rerender } = render(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    timelineSync.eventsLength = 2;
    processedRowIds.current = ['$older', '$evt1'];
    vListProps.shiftValues.length = 0;
    rerender(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    expect(vListProps.shiftValues).toContain(true);
  });

  it('stops anchoring the jump target once the user scrolls', async () => {
    timelineSync.liveTimelineLinked = false;
    const { container, rerender } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    act(() => {
      getScrollEl(container).dispatchEvent(new Event('wheel', { bubbles: true }));
    });
    vListHandle.scrollToIndex.mockClear();

    timelineSync.focusItem = { eventId: '$evt1', scrollTo: false, highlight: true };
    timelineSync.eventsLength = 2;
    rerender(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });

  it('back-paginates after the user scrolls up from a focused event', async () => {
    timelineSync.liveTimelineLinked = false;
    timelineSync.canPaginateBack = true;
    const { container } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    act(() => {
      getScrollEl(container).dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -100 })
      );
      lastOnScroll?.(0);
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalledWith(true, true);
  });

  it('does not back-paginate from a settled permalink scroll callback', async () => {
    timelineSync.liveTimelineLinked = false;
    timelineSync.canPaginateBack = true;
    render(<RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />);

    await settleInitialScroll();
    act(() => lastOnScroll?.(0));

    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('does not back-paginate when the focused reader scrolls toward the bottom', async () => {
    timelineSync.liveTimelineLinked = false;
    timelineSync.canPaginateBack = true;
    const { container } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    act(() => {
      getScrollEl(container).dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
      lastOnScroll?.(0);
    });

    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('consumes focused scroll intent after requesting one page', async () => {
    timelineSync.liveTimelineLinked = false;
    timelineSync.canPaginateBack = true;
    const { container } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$evt1" />
    );

    await settleInitialScroll();
    act(() => {
      getScrollEl(container).dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -100 })
      );
      lastOnScroll?.(0);
      lastOnScroll?.(0);
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('retries an unresolved focus after timeline events are rendered', async () => {
    timelineSync.liveTimelineLinked = false;
    timelineSync.focusItem = { eventId: '$evt1', scrollTo: true, highlight: true };
    processedRowsVisible.current = false;
    const { rerender } = renderTimeline();

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();

    processedRowsVisible.current = true;
    timelineSync.eventsLength = 2;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'center' })
    );
  });

  it('cancels a pending context load when opening an already-rendered event', async () => {
    const { getByText } = renderTimeline();
    await settleInitialScroll();

    const handleOpenEvent = timelineActionsOptions.current?.handleOpenEvent as
      | ((eventId: string) => void)
      | undefined;
    act(() => handleOpenEvent?.('$evt1'));

    expect(timelineSync.cancelEventTimelineLoad).toHaveBeenCalled();
    expect(getByText('Jump to Latest')).toBeTruthy();
  });

  it('keeps a fresh highlight visible for two seconds when refocusing the same event', () => {
    vi.useFakeTimers();
    try {
      timelineSync.focusItem = { eventId: '$evt1', scrollTo: false, highlight: true };
      const { rerender } = renderTimeline();

      act(() => vi.advanceTimersByTime(1500));
      timelineSync.focusItem = { eventId: '$evt1', scrollTo: false, highlight: true };
      rerender(<RoomTimeline room={room} editor={{} as Editor} />);
      act(() => vi.advanceTimersByTime(600));

      expect(timelineSync.setFocusItem).not.toHaveBeenCalledWith(undefined);

      act(() => vi.advanceTimersByTime(1400));
      expect(timelineSync.setFocusItem).toHaveBeenCalledWith(undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it('scrolls to the nearest visible row when the jump target is filtered out', async () => {
    const { rerender } = renderTimeline();

    // Let the mount-time initial scroll settle, then isolate the focus jump.
    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    unrenderedJumpTarget.current = { eventId: '$hidden', rawIndex: 5 };
    timelineSync.focusItem = { eventId: '$hidden', scrollTo: true, highlight: true };
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'center' })
    );

    // The highlight is retargeted to the row we actually landed on.
    const [setFocusItemCall] = (timelineSync.setFocusItem as ReturnType<typeof vi.fn>).mock.calls;
    type FocusItem = NonNullable<typeof timelineSync.focusItem>;
    const updater = setFocusItemCall?.[0] as (prev: FocusItem) => FocusItem;
    expect(updater({ eventId: '$hidden', scrollTo: true, highlight: true })).toEqual({
      eventId: '$evt1',
      scrollTo: true,
      highlight: true,
    });
  });

  it('does not paginate from a focused scroll after Virtua acknowledges it', async () => {
    timelineSync.liveTimelineLinked = false;
    timelineSync.canPaginateForward = true;
    timelineSync.focusItem = { eventId: '$evt1', scrollTo: true, highlight: true };
    renderTimeline();

    (timelineSync.setFocusItem as ReturnType<typeof vi.fn>).mockClear();
    act(() => lastOnScroll?.(900));

    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();

    act(() => lastOnScrollEnd?.());

    const settleFocus = (timelineSync.setFocusItem as ReturnType<typeof vi.fn>).mock.calls.at(
      -1
    )?.[0] as
      | ((
          focusItem: NonNullable<typeof timelineSync.focusItem>
        ) => NonNullable<typeof timelineSync.focusItem>)
      | undefined;
    expect(settleFocus?.({ eventId: '$evt1', scrollTo: true, highlight: true })).toEqual({
      eventId: '$evt1',
      scrollTo: false,
      highlight: true,
    });

    timelineSync.focusItem = { eventId: '$evt1', scrollTo: false, highlight: true };
    act(() => lastOnScroll?.(900));

    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('re-pins on a viewport shrink while pinned to the bottom', async () => {
    const { container } = renderTimeline();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    vListHandle.scrollToIndex.mockClear();

    // Pinned: the view ends exactly at the content bottom (1000 - 400 - 600 = 0).
    vListHandle.scrollOffset = 400;
    act(() => lastOnScroll?.(400));

    // A growing composer shrinks the timeline viewport (600 -> 578).
    const viewportEl = getViewportEl(container);
    act(() => fireResize(viewportEl, 600));
    act(() => fireResize(viewportEl, 578));

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'end' })
    );
  });

  it('does not re-pin on a viewport shrink while scrolled up but still flagged', async () => {
    const { container } = renderTimeline();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    vListHandle.scrollToIndex.mockClear();

    // Scrolled up 60px off the bottom (1000 - 340 - 600 = 60): inside the 100px
    // atBottom tolerance, but the user has clearly moved off the pre-resize bottom.
    vListHandle.scrollOffset = 340;
    act(() => lastOnScroll?.(340));

    const viewportEl = getViewportEl(container);
    act(() => fireResize(viewportEl, 600));
    act(() => fireResize(viewportEl, 578));

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });
});

describe('remote read receipts', () => {
  const unread = {
    readUptoEventId: '$read:example.org',
    inLiveTimeline: true,
    scrollTo: false,
  };

  it('clears the marker when the room is read on another device', () => {
    getRoomUnreadInfoMock.mockReturnValue(unread);
    renderTimeline();
    expect(processedTimelineOptions.current?.readUptoEventId).toBe('$read:example.org');

    getRoomUnreadInfoMock.mockReturnValue(undefined);
    act(() => {
      emitReceiptFor('@me:example.org');
    });

    expect(processedTimelineOptions.current?.readUptoEventId).toBeUndefined();
  });

  it('ignores receipts belonging to other users', () => {
    getRoomUnreadInfoMock.mockReturnValue(unread);
    renderTimeline();

    getRoomUnreadInfoMock.mockReturnValue(undefined);
    act(() => {
      emitReceiptFor('@bob:example.org');
    });

    expect(processedTimelineOptions.current?.readUptoEventId).toBe('$read:example.org');
  });

  it('keeps the marker when the room is still unread after the receipt', () => {
    getRoomUnreadInfoMock.mockReturnValue(unread);
    renderTimeline();

    act(() => {
      emitReceiptFor('@me:example.org');
    });

    expect(processedTimelineOptions.current?.readUptoEventId).toBe('$read:example.org');
  });
});

describe('failed backfill on an empty timeline', () => {
  it('surfaces the error with a working Retry instead of endless placeholders', () => {
    timelineSync.eventsLength = 0;
    timelineSync.canPaginateBack = true;
    timelineSync.backwardError = true;

    const { getByText } = renderTimeline();

    expect(getByText('Failed to load history.')).toBeVisible();

    act(() => {
      getByText('Retry').click();
    });
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('still shows placeholders while the first backfill is in flight', () => {
    timelineSync.eventsLength = 0;
    timelineSync.canPaginateBack = true;
    timelineSync.backwardStatus = 'loading';

    const { container } = renderTimeline();

    expect(container.textContent).not.toContain('Failed to load history.');
  });
});

describe('MemoizedTimelineItem', () => {
  it('re-renders message rows when canRedact flips (power-level update)', () => {
    const { container, rerender } = renderTimeline();
    expect(container.textContent).toContain('canRedact:false');

    rendererCtxPermissions.canRedact = true;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(container.textContent).toContain('canRedact:true');
  });

  it('re-renders message rows when a display setting flips', () => {
    const { container, rerender } = renderTimeline();
    expect(container.textContent).toContain('hideReads:false');

    rendererCtxSettings.hideReads = true;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(container.textContent).toContain('hideReads:true');
  });

  it('does not re-render rows when nothing a row depends on changed', () => {
    const { rerender } = renderTimeline();
    const before = rowRenders.count;

    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(rowRenders.count).toBe(before);
  });

  it('does not re-render a merged relation row for a focusItem targeting another event', () => {
    rowItemIndex.current = -1;
    const { rerender } = renderTimeline();
    const before = rowRenders.count;

    timelineSync.focusItem = { eventId: '$other', highlight: true, scrollTo: false };
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(rowRenders.count).toBe(before);
  });

  it('re-renders a row when its event is redacted in place', () => {
    const { rerender } = renderTimeline();
    const before = rowRenders.count;

    eventRedacted.current = true;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(rowRenders.count).toBeGreaterThan(before);
  });
});

describe('jump reveal and focus-regain read receipts', () => {
  it('keeps the timeline hidden while a jump is still pending', () => {
    timelineSync.jumpFailed = false;
    const { getByText } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$jump:example.org" />
    );

    expect(getByText('canRedact:false hideReads:false')).not.toBeVisible();
  });

  it('restarts a route jump when the Room instance is replaced with the same id', () => {
    const replacementRoom = Object.create(room) as Room;
    const { rerender } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$jump:example.org" />
    );
    expect(timelineSync.loadEventTimeline).toHaveBeenCalledTimes(1);

    rerender(
      <RoomTimeline room={replacementRoom} editor={{} as Editor} eventId="$jump:example.org" />
    );

    expect(timelineSync.loadEventTimeline).toHaveBeenCalledTimes(2);
  });

  it('reveals the timeline when the jump fails instead of leaving a blank room', () => {
    timelineSync.jumpFailed = false;
    const { getByText, rerender } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$jump:example.org" />
    );
    expect(getByText('canRedact:false hideReads:false')).not.toBeVisible();

    timelineSync.jumpFailed = true;
    act(() => {
      rerender(<RoomTimeline room={room} editor={{} as Editor} eventId="$jump:example.org" />);
    });

    expect(getByText('canRedact:false hideReads:false')).toBeVisible();
  });

  it('restores bottom state when a jump fails', async () => {
    const { getByText, queryByText } = renderTimeline();
    await waitFor(() => expect(getByText('canRedact:false hideReads:false')).toBeVisible());

    act(() => lastOnScroll?.(0));
    expect(getByText('Jump to Latest')).toBeTruthy();

    const onJumpError = timelineSyncOptions.current?.onJumpError as (() => void) | undefined;
    act(() => onJumpError?.());

    expect(queryByText('Jump to Latest')).toBeNull();
  });

  it('notifies the user when a jump target cannot be loaded', () => {
    render(<RoomTimeline room={room} editor={{} as Editor} eventId="$missing:example.org" />);

    const onJumpError = timelineSyncOptions.current?.onJumpError as (() => void) | undefined;
    act(() => onJumpError?.());

    expect(showToastMock).toHaveBeenCalledWith('Unable to load this message.');
  });

  it('clears a notification route when an own message returns to the live timeline', async () => {
    timelineSync.jumpFailed = true;
    const { getByText, queryByText } = render(
      <RoomTimeline room={room} editor={{} as Editor} eventId="$jump:example.org" />
    );
    await waitFor(() => expect(getByText('canRedact:false hideReads:false')).toBeVisible());
    expect(getByText('Jump to Latest')).toBeTruthy();

    const onReturnToLive = timelineSyncOptions.current?.onReturnToLive as (() => void) | undefined;
    act(() => onReturnToLive?.());

    expect(navigateRoomMock).toHaveBeenCalledWith(room.roomId, undefined, { replace: true });
    expect(queryByText('Jump to Latest')).toBeNull();
  });
});

describe('unread read marker (normal sync)', () => {
  it('does not let the delayed initial bottom scroll overwrite an unread marker', async () => {
    getRoomUnreadInfoMock.mockReturnValue({
      readUptoEventId: '$evt1',
      inLiveTimeline: true,
      scrollTo: true,
    });

    renderTimeline();
    vListHandle.scrollToIndex.mockClear();
    await settleInitialScroll();

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });

  it('feeds the read marker to timeline processing and clears it on window blur', () => {
    getRoomUnreadInfoMock.mockReturnValue({
      readUptoEventId: '$read:example.org',
      inLiveTimeline: true,
      scrollTo: false,
    });
    windowFocused.current = true;
    renderTimeline();

    expect(processedTimelineOptions.current?.readUptoEventId).toBe('$read:example.org');

    windowFocused.current = false;
    act(() => {
      document.dispatchEvent(new Event('focusout'));
    });

    expect(processedTimelineOptions.current?.readUptoEventId).toBeUndefined();
  });

  it('does not mark the room read after scrolling to its unread boundary', async () => {
    getRoomUnreadInfoMock.mockReturnValue({
      readUptoEventId: '$read:example.org',
      inLiveTimeline: true,
      scrollTo: true,
    });
    readMarkerInLiveTimeline.current = true;
    windowFocused.current = true;
    eventTimeline.current = liveTimeline;
    unrenderedJumpTarget.current = { eventId: '$read:example.org', rawIndex: 0 };

    renderTimeline();

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(0, { align: 'start' });
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(markAsReadMock).not.toHaveBeenCalled();
  });
});

describe('unread read marker (sliding sync)', () => {
  it('keeps the marker anchored across a limited-window timeline reset', () => {
    getRoomUnreadInfoMock.mockReturnValue({
      readUptoEventId: '$read:example.org',
      inLiveTimeline: true,
      scrollTo: false,
    });
    const { rerender } = renderTimeline();

    expect(processedTimelineOptions.current?.readUptoEventId).toBe('$read:example.org');

    timelineSync.eventsLength = 0;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    timelineSync.eventsLength = 1;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(processedTimelineOptions.current?.readUptoEventId).toBe('$read:example.org');
  });
});

describe('scroll-edge pagination', () => {
  it('marks the timeline as at the bottom when jumping to latest', async () => {
    const { getByText, queryByText } = renderTimeline();

    await waitFor(() => expect(getByText('canRedact:false hideReads:false')).toBeVisible());

    // Simulate a stale virtualizer measurement reporting the viewport above the
    // bottom. A programmatic jump may not emit a follow-up scroll event.
    act(() => lastOnScroll?.(0));
    expect(getByText('Jump to Latest')).toBeTruthy();

    act(() => {
      getByText('Jump to Latest').click();
    });

    expect(timelineSync.focusLiveTimeline).toHaveBeenCalled();
    expect(queryByText('Jump to Latest')).toBeNull();
  });

  it('paginates backwards near the top only while a pagination token exists', () => {
    const { rerender } = renderTimeline();

    timelineSync.canPaginateBack = true;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    act(() => lastOnScroll?.(100));
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);

    (timelineSync.handleTimelinePagination as ReturnType<typeof vi.fn>).mockClear();
    timelineSync.canPaginateBack = false;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    act(() => lastOnScroll?.(100));
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('paginates forwards near the bottom only while a forward token remains', () => {
    const { rerender } = renderTimeline();

    timelineSync.liveTimelineLinked = false;
    timelineSync.canPaginateForward = true;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    act(() => lastOnScroll?.(0));
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);

    (timelineSync.handleTimelinePagination as ReturnType<typeof vi.fn>).mockClear();
    timelineSync.canPaginateForward = false;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    act(() => lastOnScroll?.(0));
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });
});

describe('backfill scroll anchoring', () => {
  it('re-pins to the bottom after a backfill completes if the user was at the bottom', async () => {
    const { rerender } = renderTimeline();

    // Let the mount-time initial scroll settle, then watch backfill only.
    await settleInitialScroll();
    vListHandle.scrollToIndex.mockClear();

    timelineSync.backwardStatus = 'loading';
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    timelineSync.backwardStatus = 'idle';
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'end' })
    );
  });

  it('does not scroll away after a backfill if the user had scrolled up', async () => {
    const { rerender } = renderTimeline();

    await settleInitialScroll();

    act(() => lastOnScroll?.(0));
    vListHandle.scrollToIndex.mockClear();

    timelineSync.backwardStatus = 'loading';
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    timelineSync.backwardStatus = 'idle';
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });
});
