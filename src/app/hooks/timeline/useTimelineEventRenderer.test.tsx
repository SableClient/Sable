// oxlint-disable typescript/no-explicit-any
import type { MouseEventHandler } from 'react';
import { render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  EventTimelineSet,
  MatrixEvent,
  PushProcessor,
  Room,
  MatrixClient,
} from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import type { EventStatus } from '$types/matrix-sdk';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { MessageLayout } from '$state/settings';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';
import { useTimelineEventRenderer } from './useTimelineEventRenderer';
import { M_POLL_START } from 'matrix-js-sdk';

// Applied once: no dynamic rAF or ResizeObserver.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('jotai', async (importActual) => {
  const actual = (await importActual()) as object;
  return {
    ...actual,
    useAtomValue: () => ({}),
    useSetAtom: () => vi.fn<(...args: unknown[]) => void>(),
  };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () =>
    ({
      getUserId: () => '@me:example.com',
      getRoom: () => undefined,
      mxcUrlToHttp: () => null,
    }) as any,
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useSableCosmetics', () => ({
  useSableCosmetics: () => ({ color: undefined, font: undefined }),
}));

vi.mock('$hooks/useRoomMemberHydration', () => ({
  useRoomMemberHydration:
    vi.fn<
      (
        room: unknown,
        userId: string,
        hasTimelineMember?: boolean,
        profileDisplayName?: string
      ) => void
    >(),
}));

vi.mock('$state/hooks/userRoomProfile', () => ({
  useOpenUserRoomProfile: () =>
    vi.fn<(roomId: string, spaceId: string | undefined, userId: string, rect?: DOMRect) => void>(),
}));

vi.mock('$hooks/useMemberPowerTag', () => ({
  useGetMemberPowerTag: () => () => undefined,
}));

vi.mock('$hooks/useMemberEventParser', () => ({
  useMemberEventParser: () => vi.fn<(mEvent: unknown) => unknown>(),
}));

vi.mock('$hooks/useRoomEvent', () => ({
  useRoomEvent: () => undefined,
}));

vi.mock('$hooks/useMentionClickHandler', () => ({
  useMentionClickHandler: () => undefined,
}));

vi.mock('$features/settings/useSettingsLinkBaseUrl', () => ({
  useSettingsLinkBaseUrl: () => 'https://app.sable.moe',
}));

vi.mock('$hooks/useIgnoredUsers', () => ({
  useIgnoredUsers: () => [],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn<() => Promise<void>>() }),
}));

vi.mock('@sentry/react', () => ({
  default: {},
  startSpan: vi.fn<(opts: unknown, fn: () => unknown) => unknown>(),
  addBreadcrumb: vi.fn<() => void>(),
  captureMessage: vi.fn<(msg: string) => void>(),
  metrics: { distribution: vi.fn<() => void>() },
}));

// Leaf components are stubbed so the snapshot reflects renderer branching only.

vi.mock('$components/message', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    EventContent: ({ content, time, icon }: any) => (
      <div data-testid="event-content">
        {icon}
        {time}
        {content}
      </div>
    ),
    ImageContent: ({ content }: any) => (
      <div data-testid="image-content" data-content={JSON.stringify(content)} />
    ),
    InlineTextDiff: ({ oldBody, newBody }: any) => (
      <div data-testid="inline-text-diff">
        <span data-old={oldBody} />
        <span data-new={newBody} />
      </div>
    ),
    MessageNotDecryptedContent: () => <div data-testid="message-not-decrypted" />,
    MSticker: ({ content }: any) => (
      <div data-testid="m-sticker" data-content={JSON.stringify(content)} />
    ),
    RedactedContent: ({ reason }: any) => (
      <div data-testid="redacted-content">{reason ?? 'Message deleted'}</div>
    ),
    RedactedReactionContent: () => <div data-testid="redacted-reaction-content" />,
    Reply: ({ replyEventId }: any) => (
      <div data-testid="reply" data-reply-event-id={replyEventId} />
    ),
    ReactionKeyInline: ({ reactionKey }: any) => (
      <span data-testid="reaction-key-inline" data-reaction-key={reactionKey} />
    ),
    Time: ({ ts, compact }: any) => (
      <time data-testid="time" data-ts={ts} data-compact={compact ? 'true' : 'false'} />
    ),
  };
});

vi.mock('$components/media', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    Image: ({ src, alt }: any) => <img data-testid="image" src={src} alt={alt} />,
  };
});

vi.mock('$components/image-viewer', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    ImageViewer: ({ src, alt }: any) => (
      <div data-testid="image-viewer" data-src={src} data-alt={alt} />
    ),
  };
});

vi.mock('$components/RenderMessageContent', () => ({
  RenderMessageContent: ({ msgType, displayName }: any) => (
    <div
      data-testid="render-message-content"
      data-msg-type={msgType}
      data-display-name={displayName}
    />
  ),
}));

vi.mock('$components/ClientSideHoverFreeze', () => ({
  ClientSideHoverFreeze: ({ children }: any) => (
    <div data-testid="client-side-hover-freeze">{children}</div>
  ),
}));

vi.mock('$components/user-avatar', () => ({
  UserAvatar: ({ userId }: any) => <div data-testid="user-avatar" data-user-id={userId} />,
}));

vi.mock('$components/unread-badge', () => ({
  UnreadBadge: ({ highlight }: any) => (
    <div data-testid="unread-badge" data-highlight={String(!!highlight)} />
  ),
  UnreadBadgeCenter: ({ highlight }: any) => (
    <div data-testid="unread-badge-center" data-highlight={String(!!highlight)} />
  ),
}));

vi.mock('$features/room/message', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    // Stub Message to pass through props as data-attrs for snapshot
    Message: ({
      senderId,
      senderDisplayName,
      notifyHighlight,
      content,
      reactions,
      reply,
      children,
      collapse,
      highlight,
      isMarked,
      edit,
      sendStatus,
      canDelete,
      canSendReaction,
      canPinEvent,
      hideReadReceipts,
      showDeveloperTools,
      hour24Clock,
      activeReplyId,
    }: any) => (
      <div
        data-testid="message"
        data-sender-id={senderId}
        data-sender-display-name={senderDisplayName}
        data-notify-highlight={notifyHighlight}
        data-collapse={String(!!collapse)}
        data-highlight={String(!!highlight)}
        data-is-marked={String(!!isMarked)}
        data-edit={String(!!edit)}
        data-send-status={sendStatus}
        data-can-delete={String(!!canDelete)}
        data-can-send-reaction={String(!!canSendReaction)}
        data-can-pin-event={String(!!canPinEvent)}
        data-hide-read-receipts={String(!!hideReadReceipts)}
        data-show-developer-tools={String(!!showDeveloperTools)}
        data-hour-24={String(!!hour24Clock)}
        data-active-reply-id={activeReplyId ?? ''}
      >
        {content}
        {reply}
        {reactions}
        {children}
      </div>
    ),
    EncryptedContent: ({ mEvent, children }: any) =>
      mEvent.getType() === M_POLL_START.name ? (
        <>{children()}</>
      ) : (
        <div data-testid="encrypted-content" />
      ),
    Reactions: ({ mEventId: targetId, canSendReaction: canReact }: any) => (
      <div data-testid="reactions" data-target-id={targetId} data-can-react={String(!!canReact)} />
    ),
  };
});

vi.mock('$components/icons/phosphor', () => ({
  Code: () => <span data-testid="icon-code">[Code]</span>,
  Hash: () => <span data-testid="icon-hash">[Hash]</span>,
  menuIcon: () => <span data-testid="icon-menu">[Menu]</span>,
  PencilSimple: () => <span data-testid="icon-pencil">[Pencil]</span>,
  Phone: () => <span data-testid="icon-phone">[Phone]</span>,
  PhoneDisconnect: () => <span data-testid="icon-phone-disconnect">[PhoneDisconnect]</span>,
  PushPin: () => <span data-testid="icon-pushpin">[PushPin]</span>,
  PushPinSlash: () => <span data-testid="icon-pushpin-slash">[PushPinSlash]</span>,
  Smiley: () => <span data-testid="icon-smiley">[Smiley]</span>,
  timelineIcon: (Icon: any) => Icon,
  Trash: () => <span data-testid="icon-trash">[Trash]</span>,
}));

const ROOM_ID = '!room:example.com';
const ALICE = '@alice:example.com';
const BOB = '@bob:example.com';

const hiddenEventsDefaults: ResolvedHiddenEventSettings = {
  showHiddenEvents: true,
  showTombstoneEvents: true,
  hiddenEventEdits: true,
  hiddenEventRedactionTimeline: true,
  hiddenEventReactions: true,
  hiddenEventReactionTombstone: true,
  hiddenEventReactionRedactionTimeline: true,
  hiddenEventOther: true,
};

const htmlReactParserOptions = {} as HTMLReactParserOptions;
const linkifyOpts = {} as LinkifyOpts;

type EventFactoryOptions = {
  id: string;
  type: string;
  sender?: string;
  content?: Record<string, unknown>;
  prevContent?: Record<string, unknown>;
  wireContent?: Record<string, unknown>;
  originalContent?: Record<string, unknown>;
  ts?: number;
  redacted?: boolean;
  redaction?: boolean;
  encrypted?: boolean;
  threadRootId?: string;
  replyEventId?: string;
  status?: (typeof EventStatus)[keyof typeof EventStatus]; // eslint-disable-line
};

function createEvent(opts: EventFactoryOptions): MatrixEvent {
  const {
    id,
    type,
    sender = BOB,
    content = {},
    prevContent = {},
    wireContent = content,
    originalContent = content,
    ts = 1_700_000_000_000,
    redacted = false,
    redaction = false,
    encrypted = false,
    threadRootId,
    replyEventId,
    status,
  } = opts;
  return {
    getId: () => id,
    getType: () => type,
    getSender: () => sender,
    getContent: () => content,
    getPrevContent: () => prevContent,
    getWireContent: () => wireContent,
    getOriginalContent: () => originalContent,
    getTs: () => ts,
    isRedacted: () => redacted,
    isRedaction: () => redaction,
    isEncrypted: () => encrypted,
    getUnsigned: () =>
      ({
        redacted_because: redacted ? { content: { reason: undefined } } : undefined,
      }) as any,
    getAssociatedStatus: () => status ?? null,
    threadRootId,
    replyEventId,
    getRelation: () => null,
    getServerAggregatedRelation: () => null,
    getReplacedBy: () => null,
    getVisibility: () => null,
    getStatus: () => null,
    getThread: () => threadRootId ?? null,
    getReplyEventId: () => replyEventId ?? null,
  } as unknown as MatrixEvent;
}

function createTimelineSet(): EventTimelineSet {
  return {
    relations: {
      getChildEventsForEvent: () => null,
    },
    findEventById: () => null,
    getTimelineForEvent: () => null,
    getLiveTimeline: () => ({
      getEvents: () => [],
    }),
  } as unknown as EventTimelineSet;
}

const timelineSet = createTimelineSet();

function createRoom(): Room {
  return {
    roomId: ROOM_ID,
    getMember: () => null,
    getThread: () => null,
    getThreadUnreadNotificationCount: () => 0,
    findEventById: () => null,
    getUnfilteredTimelineSet: () => createTimelineSet() as any,
    getEventReadUpTo: () => null,
    getLiveTimeline: () => ({ getEvents: () => [], getNeighbouringTimeline: () => null }),
    getUnreadNotificationCount: () => 0,
    getMyMembership: () => 'join',
    hasEncryptionStateEvent: () => false,
    client: { getUserId: () => ALICE },
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    off: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    removeListener: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
  } as unknown as Room;
}

const room = createRoom();

const mx = {
  getUserId: () => ALICE,
  getRoom: () => undefined,
  mxcUrlToHttp: () => null,
} as unknown as MatrixClient;

const pushProcessor: PushProcessor = {
  actionsForEvent: () => null,
} as unknown as PushProcessor;

const rendererOpts = {
  room,
  mx,
  pushProcessor,
  nicknames: {} as Record<string, string>,
  getProfile: () => undefined,
  imagePackRooms: [] as Room[],
  settings: {
    messageLayout: MessageLayout.Modern,
    messageSpacing: 0 as any,
    hideReads: false,
    showDeveloperTools: false,
    hour24Clock: false,
    dateFormatString: 'MMM dd, yyyy',
    mediaAutoLoad: false,
    showUrlPreview: false,
    showBundledPreview: false,
    showClientUrlPreview: false,
    showMaps: false,
    autoplayStickers: false,
    hideMemberInReadOnly: false,
    isReadOnly: false,
    hideMembershipEvents: false,
    hideNickAvatarEvents: false,
    hiddenEvents: hiddenEventsDefaults,
    hideThreadChip: false,
  },
  state: {
    focusItem: undefined,
    editId: undefined,
    activeReplyId: undefined,
    openThreadId: undefined,
    suppressMark: undefined,
  },
  permissions: {
    canRedact: false,
    canDeleteOwn: false,
    canSendReaction: false,
    canPinEvent: false,
  },
  callbacks: {
    onUserClick: vi.fn<MouseEventHandler<HTMLButtonElement>>(),
    onUsernameClick: vi.fn<MouseEventHandler<HTMLButtonElement>>(),
    onReplyClick:
      vi.fn<(event: React.MouseEvent<HTMLButtonElement>, startThread?: boolean) => void>(),
    onReactionToggle: vi.fn<(targetEventId: string, key: string, shortcode?: string) => void>(),
    onEditId: vi.fn<(editId?: string) => void>(),
    onResend: vi.fn<(mEvent: MatrixEvent) => void>(),
    onDeleteFailedSend: vi.fn<(mEvent: MatrixEvent) => void>(),
    setOpenThread: vi.fn<(threadId: string | undefined) => void>(),
    handleOpenReply: vi.fn<MouseEventHandler<HTMLButtonElement>>(),
  },
  utils: {
    htmlReactParserOptions,
    linkifyOpts,
    getMemberPowerTag: () => ({ name: 'Admin' }),
    parseMemberEvent:
      vi.fn<(mEvent: MatrixEvent) => { icon: React.ReactNode; body: React.ReactNode }>(),
  },
};

function renderEvent(event: MatrixEvent, isStateEvent: boolean) {
  const { result } = renderHook(() => useTimelineEventRenderer(rendererOpts));
  const renderFn = result.current;
  const node = renderFn(
    event.getType() ?? 'UNKNOWN',
    isStateEvent,
    event.getId() ?? 'null',
    event,
    0,
    timelineSet,
    false
  );
  if (node === null) return { container: null as unknown as HTMLElement };
  const { container } = render(node as any);
  return { container };
}

function createCustomRoom(overrides: Record<string, unknown>) {
  const base = createRoom();
  return Object.assign(base, overrides) as unknown as Room;
}

function createCustomTimelineSet(overrides: Record<string, unknown>) {
  const base = createTimelineSet();
  return Object.assign(base, overrides) as unknown as EventTimelineSet;
}

// ── Helper: render with custom opts ─────────────────────────────────────────

function renderEventWithOverrides(
  event: MatrixEvent,
  isStateEvent: boolean,
  overrides: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state?: any;
    roomOverrides?: Record<string, unknown>;
    timelineSetOverrides?: Record<string, unknown>;
  }
) {
  const customRoom = createCustomRoom(overrides.roomOverrides ?? {});
  const customTimelineSet =
    overrides.timelineSetOverrides != null
      ? createCustomTimelineSet(overrides.timelineSetOverrides)
      : timelineSet;
  const opts = {
    ...rendererOpts,
    state: { ...rendererOpts.state, ...overrides.state },
    room: customRoom,
  };
  const { result } = renderHook(() => useTimelineEventRenderer(opts));
  const renderFn = result.current;
  const node = renderFn(
    event.getType() ?? 'UNKNOWN',
    isStateEvent,
    event.getId() ?? 'null',
    event,
    0,
    customTimelineSet,
    false
  );
  if (node === null) return { container: null as unknown as HTMLElement };
  const { container } = render(node as any);
  return { container };
}

// ── Test suite ─────────────────────────────────────────────────────────────

type BranchEntry = {
  name: string;
  eventType: string;
  isStateEvent: boolean;
  createEvent: () => MatrixEvent;
};

const branches: BranchEntry[] = [
  {
    name: 'm.room.message (RoomMessage)',
    eventType: EventType.RoomMessage,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$msg:example.com',
        type: EventType.RoomMessage,
        content: { msgtype: 'm.text', body: 'Hello world!' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.encrypted (RoomMessageEncrypted)',
    eventType: EventType.RoomMessageEncrypted,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$enc:example.com',
        type: EventType.RoomMessageEncrypted,
        encrypted: true,
        content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: '...' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.sticker (Sticker)',
    eventType: EventType.Sticker,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$sticker:example.com',
        type: EventType.Sticker,
        content: { body: 'Sticker!', url: 'mxc://example.com/sticker' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.poll.start (M_POLL_START)',
    eventType: M_POLL_START.name,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$poll:example.com',
        type: M_POLL_START.name,
        content: {
          'm.poll.start': {
            question: { 'm.text': [{ body: 'Yes or No?' }] },
            max_selections: 1,
            answers: [
              { id: 'yes', 'm.text': [{ body: 'Yes' }] },
              { id: 'no', 'm.text': [{ body: 'No' }] },
            ],
          },
          msgtype: 'm.text',
          body: 'Poll: Yes or No?',
        },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.member (RoomMember)',
    eventType: EventType.RoomMember,
    isStateEvent: true,
    createEvent: () =>
      createEvent({
        id: '$member:example.com',
        type: EventType.RoomMember,
        content: { membership: 'join', displayname: 'Bob' },
        prevContent: { membership: 'invite' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.name (RoomName)',
    eventType: EventType.RoomName,
    isStateEvent: true,
    createEvent: () =>
      createEvent({
        id: '$name:example.com',
        type: EventType.RoomName,
        content: { name: 'My Chat Room' },
        prevContent: { name: 'Old Name' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.topic (RoomTopic)',
    eventType: EventType.RoomTopic,
    isStateEvent: true,
    createEvent: () =>
      createEvent({
        id: '$topic:example.com',
        type: EventType.RoomTopic,
        content: { topic: 'A place to chat' },
        prevContent: { topic: '' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.avatar (RoomAvatar)',
    eventType: EventType.RoomAvatar,
    isStateEvent: true,
    createEvent: () =>
      createEvent({
        id: '$avatar:example.com',
        type: EventType.RoomAvatar,
        content: { url: 'mxc://example.com/avatar' },
        prevContent: { url: '' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.call.member (GroupCallMemberPrefix)',
    // GroupCallMemberPrefix is a prefix that matches m.call.member events
    eventType: EventType.GroupCallMemberPrefix,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$call:example.com',
        type: EventType.GroupCallMemberPrefix,
        content: {
          'm.calls': [{ call_id: '!call:example.com', 'm.foci': [] }],
        },
        prevContent: {},
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.reaction (Reaction)',
    eventType: EventType.Reaction,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$reaction:example.com',
        type: EventType.Reaction,
        content: {
          'm.relates_to': { rel_type: 'm.annotation', event_id: '$msg:example.com', key: '👍' },
        },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.redaction (RoomRedaction)',
    eventType: EventType.RoomRedaction,
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$redact:example.com',
        type: EventType.RoomRedaction,
        redaction: true,
        content: { reason: 'spam removal' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'm.room.pinned_events (RoomPinnedEvents)',
    eventType: EventType.RoomPinnedEvents,
    isStateEvent: true,
    createEvent: () =>
      createEvent({
        id: '$pins:example.com',
        type: EventType.RoomPinnedEvents,
        content: { pinned: ['$msg:example.com'] },
        prevContent: { pinned: [] },
        replyEventId: undefined,
      }),
  },
  {
    name: 'state event fallback (unknown state event)',
    eventType: 'io.sable.unknown.state',
    isStateEvent: true,
    createEvent: () =>
      createEvent({
        id: '$unknown-state:example.com',
        type: 'io.sable.unknown.state',
        content: { arbitrary: 'state data' },
        replyEventId: undefined,
      }),
  },
  {
    name: 'non-state event fallback (unknown event)',
    eventType: 'io.sable.unknown.event',
    isStateEvent: false,
    createEvent: () =>
      createEvent({
        id: '$unknown-event:example.com',
        type: 'io.sable.unknown.event',
        content: { arbitrary: 'data' },
        replyEventId: undefined,
      }),
  },
];

const highlightOf = (container: HTMLElement) =>
  container.querySelector('[data-testid="message"]')?.getAttribute('data-highlight');

describe('useTimelineEventRenderer', () => {
  describe.each(branches)('$name', ({ isStateEvent, createEvent: makeEvent }) => {
    it('renders correctly', () => {
      const evt = makeEvent();
      // The renderer uses `timelineSet` for reactions; our mock returns null,
      // so no reaction data. That's fine for snapshot consistency.
      const { container } = renderEvent(evt, isStateEvent);
      expect(container).not.toBeNull();
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  it('renders a decrypted poll through RenderMessageContent', () => {
    const evt = createEvent({
      id: '$encrypted-poll:example.com',
      type: EventType.RoomMessageEncrypted,
      content: {
        'm.poll.start': {
          question: { 'm.text': [{ body: 'Yes or No?' }] },
        },
        msgtype: 'm.text',
      },
    });
    evt.getType = vi
      .fn<() => string>()
      .mockReturnValueOnce(EventType.RoomMessageEncrypted)
      .mockReturnValue(M_POLL_START.name);

    const { container } = renderEvent(evt, false);

    expect(container.querySelector('[data-testid="render-message-content"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="message-not-decrypted"]')).toBeNull();
  });

  // ── Additional coverage ───────────────────────────────────────────────────

  describe('activeReplyId === mEventId (marked logic)', () => {
    const msgEvent = () =>
      createEvent({
        id: '$msg:example.com',
        type: EventType.RoomMessage,
        content: { msgtype: 'm.text', body: 'Hello world!' },
        replyEventId: undefined,
      });

    it('sets data-is-marked="true" when activeReplyId matches', () => {
      const evt = msgEvent();
      const { container } = renderEventWithOverrides(evt, false, {
        state: { activeReplyId: '$msg:example.com' },
      });
      expect(container).not.toBeNull();
      expect(container.innerHTML).toMatchSnapshot();
    });

    it('suppresses mark when suppressMark is true', () => {
      const evt = msgEvent();
      const { container } = renderEventWithOverrides(evt, false, {
        state: { activeReplyId: '$msg:example.com', suppressMark: true },
      });
      expect(container).not.toBeNull();
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe('reactions bar (useReactionsGuard)', () => {
    const msgEvent = () =>
      createEvent({
        id: '$msg:example.com',
        type: EventType.RoomMessage,
        content: { msgtype: 'm.text', body: 'Hello world!' },
        replyEventId: undefined,
      });

    function createRelationsWithReactions() {
      return {
        getSortedAnnotationsByKey: () =>
          [
            [
              '👍',
              new Set([
                createEvent({
                  id: '$react:example.com',
                  type: EventType.Reaction,
                  sender: ALICE,
                  content: {
                    'm.relates_to': {
                      rel_type: 'm.annotation',
                      event_id: '$msg:example.com',
                      key: '👍',
                    },
                  },
                }),
              ]),
            ],
          ] as [string, Set<MatrixEvent>][],
        getRelations: () => [],
        on: () => {},
        off: () => {},
      };
    }

    it('renders reactions bar when reactions exist', () => {
      const evt = msgEvent();
      const { container } = renderEventWithOverrides(evt, false, {
        timelineSetOverrides: {
          relations: {
            getChildEventsForEvent: () => createRelationsWithReactions(),
          } as unknown as EventTimelineSet['relations'],
        },
      });
      expect(container).not.toBeNull();
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe('thread chip', () => {
    const msgEvent = () =>
      createEvent({
        id: '$msg:example.com',
        type: EventType.RoomMessage,
        content: { msgtype: 'm.text', body: 'Hello world!' },
        replyEventId: undefined,
      });

    it('renders thread chip when room.getThread returns non-null', () => {
      const evt = msgEvent();
      const mockThread = {
        length: 1,
        events: [
          createEvent({
            id: '$reply:example.com',
            type: EventType.RoomMessage,
            sender: ALICE,
            content: {
              msgtype: 'm.text',
              body: 'reply text',
              'm.relates_to': {
                rel_type: 'm.thread',
                event_id: '$msg:example.com',
              },
            },
          }),
        ],
        rootEvent: null,
        on: () => {},
        off: () => {},
      };
      const { container } = renderEventWithOverrides(evt, false, {
        roomOverrides: { getThread: () => mockThread },
      });
      expect(container).not.toBeNull();
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe('edit event (renderEditTimelineEvent path)', () => {
    it('renders an edit event with m.replace relation', () => {
      const editEvent = createEvent({
        id: '$edit:example.com',
        type: EventType.RoomMessage,
        content: {
          msgtype: 'm.text',
          body: ' * corrected message',
          'm.new_content': { msgtype: 'm.text', body: 'corrected message' },
          'm.relates_to': {
            rel_type: 'm.replace',
            event_id: '$msg:example.com',
          },
        },
        replyEventId: undefined,
      });
      // The edit event's getRelation() must return the m.relates_to info
      // for isEditEvent() and getEditTargetId() to work.
      editEvent.getRelation = () =>
        ({
          rel_type: 'm.replace',
          event_id: '$msg:example.com',
        }) as any;
      const { container } = renderEventWithOverrides(editEvent, false, {});
      expect(container).not.toBeNull();
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe('focusItem highlight', () => {
    function renderMessageAtItem(
      mEvent: MatrixEvent,
      item: number,
      focusItem?: { eventId: string; highlight: boolean; scrollTo: boolean }
    ) {
      const opts = { ...rendererOpts, state: { ...rendererOpts.state, focusItem } };
      const { result } = renderHook(() => useTimelineEventRenderer(opts));
      const node = result.current(
        mEvent.getType() ?? 'UNKNOWN',
        false,
        mEvent.getId() ?? 'null',
        mEvent,
        item,
        timelineSet,
        false
      );
      return render(node as any);
    }

    const msgEvent = (id: string) =>
      createEvent({
        id,
        type: EventType.RoomMessage,
        content: { msgtype: 'm.text', body: 'hello' },
        replyEventId: undefined,
      });

    it('highlights the row whose event id matches', () => {
      const { container } = renderMessageAtItem(msgEvent('$a:example.com'), 3, {
        eventId: '$a:example.com',
        highlight: true,
        scrollTo: false,
      });
      expect(highlightOf(container)).toBe('true');
    });

    it('does not highlight a different event', () => {
      const { container } = renderMessageAtItem(msgEvent('$b:example.com'), 3, {
        eventId: '$a:example.com',
        highlight: true,
        scrollTo: false,
      });
      expect(highlightOf(container)).toBe('false');
    });

    it('highlights the same event regardless of the raw index it renders at', () => {
      for (const item of [0, 3, 40]) {
        const { container } = renderMessageAtItem(msgEvent('$a:example.com'), item, {
          eventId: '$a:example.com',
          highlight: true,
          scrollTo: false,
        });
        expect(highlightOf(container)).toBe('true');
      }
    });

    it('does not highlight merged relation rows that share the itemIndex -1 sentinel', () => {
      const jumpTarget = renderMessageAtItem(msgEvent('$edit-1:example.com'), -1, {
        eventId: '$reaction-2:example.com',
        highlight: true,
        scrollTo: false,
      });
      expect(highlightOf(jumpTarget.container)).toBe('false');

      const otherExtra = renderMessageAtItem(msgEvent('$reaction-2:example.com'), -1, {
        eventId: '$reaction-2:example.com',
        highlight: true,
        scrollTo: false,
      });
      expect(highlightOf(otherExtra.container)).toBe('true');
    });
  });
});
