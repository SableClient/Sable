import { EventEmitter } from 'events';
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Editor } from 'slate';
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
  rowItemIndex,
  processedTimelineOptions,
  windowFocused,
  rowRenders,
} = vi.hoisted(() => ({
  vListHandle: {
    scrollSize: 1000,
    scrollOffset: 0,
    viewportSize: 600,
    scrollToIndex: vi.fn<() => void>(),
    scrollTo: vi.fn<() => void>(),
    getItemOffset: () => 0,
    getItemSize: () => 100,
  },
  timelineSync: {
    eventsLength: 1,
    timeline: { linkedTimelines: [] },
    liveTimelineLinked: true,
    backwardStatus: 'idle',
    forwardStatus: 'idle',
    canPaginateBack: false,
    focusItem: undefined as { index: number; scrollTo: boolean; highlight: boolean } | undefined,
    setFocusItem: vi.fn<() => void>(),
    setTimeline: vi.fn<() => void>(),
    loadEventTimeline: vi.fn<() => void>(),
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
  windowFocused: { current: false },
  rowItemIndex: { current: 0 },
  rowRenders: { count: 0 },
}));

let lastOnScroll: ((offset: number) => void) | undefined;

vi.mock('virtua', () => ({
  VList: forwardRef(function MockVList(
    {
      data,
      children,
      onScroll,
    }: {
      data: unknown[];
      children: (item: unknown, index: number) => ReactNode;
      onScroll?: (offset: number) => void;
    },
    ref
  ) {
    lastOnScroll = onScroll;
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
  useRoomNavigate: () => ({ navigateRoom: vi.fn<() => void>() }),
}));

vi.mock('$hooks/useSpace', () => ({ useSpaceOptionally: () => undefined }));

vi.mock('$hooks/useIgnoredUsers', () => ({ useIgnoredUsers: () => [] }));

vi.mock('$hooks/useImagePackRooms', () => ({ useImagePackRooms: () => [] }));

vi.mock('$state/hooks/userRoomProfile', () => ({
  useOpenUserRoomProfile: () => vi.fn<() => void>(),
}));

vi.mock('$hooks/timeline/useTimelineSync', () => ({
  useTimelineSync: () => ({
    ...timelineSync,
    setUnreadInfo: setUnreadTimelineMock,
  }),
}));

vi.mock('$hooks/timeline/useTimelineActions', () => ({
  useTimelineActions: () => ({
    handleUserClick: vi.fn<() => void>(),
    handleUsernameClick: vi.fn<() => void>(),
    handleReplyClick: vi.fn<() => void>(),
    handleReactionToggle: vi.fn<() => void>(),
    handleEdit: vi.fn<() => void>(),
    handleResend: vi.fn<() => void>(),
    handleDeleteFailedSend: vi.fn<() => void>(),
    handleOpenReply: vi.fn<() => void>(),
    setOpenThread: vi.fn<() => void>(),
  }),
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
      isRedacted: () => false,
    },
    timelineSet: undefined,
    eventSender: '@me:example.org',
    editId: undefined,
    reactionsKey: '',
    content: undefined,
  } as unknown as ProcessedEvent;
  return {
    ...actual,
    useProcessedTimeline: (options: Record<string, unknown>) => {
      processedTimelineOptions.current = options;
      // Same object every call so the row memo can compare eventData by identity.
      fakeEvent.itemIndex = rowItemIndex.current;
      return [fakeEvent];
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
  getEventTimeline: () => undefined,
  getFirstLinkedTimeline: () => undefined,
  getInitialTimeline: () => undefined,
  getEventIdAbsoluteIndex: () => undefined,
}));

vi.mock('$utils/notifications', () => ({ markAsRead: vi.fn<() => void>() }));

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

const fireResize = (element: Element) => {
  observers.forEach(({ callback, elements }) => {
    if (!elements.has(element)) return;
    callback(
      [{ target: element, contentRect: { height: 1 } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver
    );
  });
};

const roomEmitter = new EventEmitter();
const room = {
  roomId: '!room:example.org',
  getLiveTimeline: () => undefined,
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

const renderTimeline = () => render(<RoomTimeline room={room} editor={{} as Editor} />);

beforeEach(() => {
  getRoomUnreadInfoMock.mockReset();
  rendererCtxPermissions.canRedact = false;
  rendererCtxSettings.hideReads = false;
  processedTimelineOptions.current = undefined;
  windowFocused.current = false;
  rowItemIndex.current = 0;
  rowRenders.count = 0;
  timelineSync.eventsLength = 1;
  timelineSync.focusItem = undefined;
  timelineSync.canPaginateBack = false;
  timelineSync.liveTimelineLinked = true;
  timelineSync.backwardStatus = 'idle';
  timelineSync.forwardStatus = 'idle';
  (timelineSync.handleTimelinePagination as ReturnType<typeof vi.fn>).mockReset();
});

describe('RoomTimeline content ResizeObserver', () => {
  beforeEach(() => {
    observers.length = 0;
    lastOnScroll = undefined;
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    vListHandle.scrollToIndex.mockClear();

    const contentEl = getContentEl(container);
    act(() => fireResize(contentEl));

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'end' })
    );
  });

  it('does not re-pin on content growth after scrolling off the bottom', async () => {
    const { container } = renderTimeline();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // Scroll far off the bottom: scrollSize - offset - viewportSize >= 100.
    act(() => lastOnScroll?.(0));
    vListHandle.scrollToIndex.mockClear();

    const contentEl = getContentEl(container);
    act(() => fireResize(contentEl));

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls to the nearest visible row when the jump target is filtered out', async () => {
    const { rerender } = renderTimeline();

    // Let the mount-time initial scroll settle, then isolate the focus jump.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    vListHandle.scrollToIndex.mockClear();

    // The mocked timeline exposes one row (itemIndex 0), so raw index 5 has no
    // exact row to match.
    timelineSync.focusItem = { index: 5, scrollTo: true, highlight: true };
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ align: 'center' })
    );

    // The highlight is retargeted to the row we actually landed on.
    const [setFocusItemCall] = (timelineSync.setFocusItem as ReturnType<typeof vi.fn>).mock.calls;
    type FocusItem = NonNullable<typeof timelineSync.focusItem>;
    const updater = setFocusItemCall?.[0] as (prev: FocusItem) => FocusItem;
    expect(updater({ index: 5, scrollTo: true, highlight: true })).toEqual({
      index: 0,
      scrollTo: false,
      highlight: true,
    });
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

  it('does not re-render for a focusItem pointing at the -1 merged-row sentinel', () => {
    rowItemIndex.current = -1;
    const { rerender } = renderTimeline();
    const before = rowRenders.count;

    timelineSync.focusItem = { index: -1, highlight: true, scrollTo: false };
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(rowRenders.count).toBe(before);
  });
});

describe('unread read marker (normal sync)', () => {
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

  it('paginates forwards near the bottom only while the live timeline is not linked', () => {
    const { rerender } = renderTimeline();

    timelineSync.liveTimelineLinked = false;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    act(() => lastOnScroll?.(0));
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);

    (timelineSync.handleTimelinePagination as ReturnType<typeof vi.fn>).mockClear();
    timelineSync.liveTimelineLinked = true;
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    act(() => lastOnScroll?.(0));
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });
});

describe('backfill scroll anchoring', () => {
  it('re-pins to the bottom after a backfill completes if the user was at the bottom', async () => {
    const { rerender } = renderTimeline();

    // Let the mount-time initial scroll settle, then watch backfill only.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
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

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    act(() => lastOnScroll?.(0));
    vListHandle.scrollToIndex.mockClear();

    timelineSync.backwardStatus = 'loading';
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);
    timelineSync.backwardStatus = 'idle';
    rerender(<RoomTimeline room={room} editor={{} as Editor} />);

    expect(vListHandle.scrollToIndex).not.toHaveBeenCalled();
  });
});
