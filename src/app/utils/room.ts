import type {
  AccountDataEvents,
  EventTimelineSet,
  IMentions,
  IPowerLevelsContent,
  IPushRule,
  IPushRules,
  IThreadBundledRelationship,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomMember,
  CryptoBackend,
  StateEvents,
} from '$types/matrix-sdk';
import {
  EventTimeline,
  EventType,
  NotificationCountType,
  PushProcessor,
  PushRuleActionName,
  RelationType,
  MsgType,
  KnownMembership,
  RoomType,
} from '$types/matrix-sdk';

import type { IRoomCreateContent, RoomToParents, UnreadInfo } from '$types/matrix/room';
import { NotificationType } from '$types/matrix/room';
import * as Sentry from '@sentry/react';

export const getStateEvent = (
  room: Room,
  eventType: keyof StateEvents,
  stateKey = ''
): MatrixEvent | undefined =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType, stateKey) ??
  undefined;

export const getStateEvents = (room: Room, eventType: keyof StateEvents): MatrixEvent[] =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType) ?? [];

export const getAccountData = (
  mx: MatrixClient,
  eventType: keyof AccountDataEvents
): MatrixEvent | undefined => mx.getAccountData(eventType);

export const getMDirects = (mDirectEvent: MatrixEvent): Set<string> => {
  const roomIds = new Set<string>();
  const userIdToDirects = mDirectEvent?.getContent();

  if (userIdToDirects === undefined) return roomIds;

  Object.keys(userIdToDirects).forEach((userId) => {
    const directs = userIdToDirects[userId];
    if (Array.isArray(directs)) {
      directs.forEach((id) => {
        if (typeof id === 'string') roomIds.add(id);
      });
    }
  });

  return roomIds;
};

export const isDirectInvite = (room: Room | null, myUserId: string | null): boolean => {
  if (!room || !myUserId) return false;
  const me = room.getMember(myUserId);
  const memberEvent = me?.events?.member;
  const content = memberEvent?.getContent();
  return content?.is_direct === true;
};

export const isSpace = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, EventType.RoomCreate);
  if (!event) return false;
  return event.getContent().type === RoomType.Space;
};

export const isRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, EventType.RoomCreate);
  if (!event) return true;
  return event.getContent().type !== RoomType.Space;
};

export const isUnsupportedRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, EventType.RoomCreate);
  if (!event) return true; // Consider room unsupported if m.room.create event doesn't exist
  return event.getContent().type !== undefined && event.getContent().type !== RoomType.Space;
};

/**
 * Detects if a room is a direct message room using multiple signals for robustness:
 * 1. Primary: checks if room is in mDirects set (from m.direct account data)
 * 2. Fallback: checks if room has exactly 2 joined members (classic DM heuristic)
 *
 * The fallback handles cases where m.direct account data is incomplete or outdated.
 */
export const isDMRoom = (room: Room, mDirects?: Set<string>): boolean => {
  // Primary signal: check m.direct account data
  if (mDirects?.has(room.roomId)) {
    return true;
  }

  // Fallback: use member count heuristic for untagged DMs
  // Only applies to non-space rooms with exactly 2 members (you + them)
  if (!room.isSpaceRoom() && room.getJoinedMemberCount() === 2) {
    return true;
  }

  return false;
};

export function isValidChild(mEvent: MatrixEvent): boolean {
  return (
    mEvent.getType() === (EventType.SpaceChild as string) &&
    Array.isArray(mEvent.getContent<{ via: string[] }>().via)
  );
}

export const getAllParents = (roomToParents: RoomToParents, roomId: string): Set<string> => {
  const allParents = new Set<string>();

  const addAllParentIds = (rId: string) => {
    if (allParents.has(rId)) return;
    allParents.add(rId);

    const parents = roomToParents.get(rId);
    parents?.forEach((id) => addAllParentIds(id));
  };
  addAllParentIds(roomId);
  allParents.delete(roomId);
  return allParents;
};

export const getSpaceChildren = (room: Room) =>
  getStateEvents(room, EventType.SpaceChild).reduce<string[]>((filtered, mEvent) => {
    const stateKey = mEvent.getStateKey();
    if (isValidChild(mEvent) && stateKey) {
      filtered.push(stateKey);
    }
    return filtered;
  }, []);

export const getJoinedSpaceChildrenLeaveOrder = (
  mx: MatrixClient,
  rootSpaceId: string
): string[] => {
  const leaveOrder: string[] = [];
  const visited = new Set<string>();

  const isJoinedChild = (room: Room): boolean =>
    room.getMyMembership() === (KnownMembership.Join as string) &&
    !getStateEvent(room, EventType.RoomTombstone);

  const visitSpace = (spaceId: string) => {
    if (visited.has(spaceId)) return;
    visited.add(spaceId);

    const space = mx.getRoom(spaceId);
    if (!space || !isJoinedChild(space)) return;

    getSpaceChildren(space).forEach((childId) => {
      if (visited.has(childId)) return;

      const child = mx.getRoom(childId);
      if (!child || !isJoinedChild(child)) return;

      if (child.isSpaceRoom()) {
        visitSpace(childId);
        return;
      }

      visited.add(childId);
      leaveOrder.push(childId);
    });

    if (spaceId !== rootSpaceId) {
      leaveOrder.push(spaceId);
    }
  };

  visitSpace(rootSpaceId);

  return leaveOrder.filter((id) => id !== rootSpaceId);
};

export type JoinedSpaceChildrenSummary = {
  leaveOrder: string[];
  roomCount: number;
  subspaceCount: number;
};

export const getJoinedSpaceChildrenSummary = (
  mx: MatrixClient,
  rootSpaceId: string
): JoinedSpaceChildrenSummary => {
  const leaveOrder = getJoinedSpaceChildrenLeaveOrder(mx, rootSpaceId);
  let roomCount = 0;
  let subspaceCount = 0;

  leaveOrder.forEach((id) => {
    const room = mx.getRoom(id);
    if (room?.isSpaceRoom()) {
      subspaceCount += 1;
    } else {
      roomCount += 1;
    }
  });

  return { leaveOrder, roomCount, subspaceCount };
};

export const getRecursiveSpaceLeaveOrder = (mx: MatrixClient, rootSpaceId: string): string[] => [
  ...getJoinedSpaceChildrenLeaveOrder(mx, rootSpaceId),
  rootSpaceId,
];

export const mapParentWithChildren = (
  roomToParents: RoomToParents,
  roomId: string,
  children: string[]
) => {
  const allParents = getAllParents(roomToParents, roomId);
  children.forEach((childId) => {
    if (allParents.has(childId)) {
      // Space cycle detected.
      return;
    }
    const parents = roomToParents.get(childId) ?? new Set<string>();
    parents.add(roomId);
    roomToParents.set(childId, parents);
  });
};

export const getRoomToParents = (mx: MatrixClient): RoomToParents => {
  const map: RoomToParents = new Map();
  mx.getRooms()
    .filter((room) => isSpace(room) && room.getMyMembership() === (KnownMembership.Join as string))
    .forEach((room) => mapParentWithChildren(map, room.roomId, getSpaceChildren(room)));

  return map;
};

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  return Array.from(parents).filter((parentRoomId) => !roomToParents.has(parentRoomId));
};

const hasNotifyPushAction = (actions: IPushRule['actions']): boolean =>
  actions.some((a) => typeof a === 'string' && a === PushRuleActionName.Notify);

const findRoomMuteOverrideRule = (
  overrideRules: IPushRule[] | undefined,
  roomId: string
): IPushRule | undefined =>
  overrideRules?.find(
    (rule) =>
      rule.rule_id === roomId && rule.rule_id.startsWith('!') && !hasNotifyPushAction(rule.actions)
  );

export const getNotificationType = (mx: MatrixClient, roomId: string): NotificationType => {
  const overrideRules = mx.getAccountData(EventType.PushRules)?.getContent<IPushRules>()
    ?.global?.override;
  if (findRoomMuteOverrideRule(overrideRules, roomId)) {
    return NotificationType.Mute;
  }

  let roomPushRule: IPushRule | undefined;
  try {
    roomPushRule = mx.getRoomPushRule('global', roomId);
  } catch {
    roomPushRule = undefined;
  }

  if (!roomPushRule) {
    return NotificationType.Default;
  }

  if ((roomPushRule.actions[0] as string) === 'notify') return NotificationType.AllMessages;
  return NotificationType.MentionsAndKeywords;
};

const NOTIFICATION_EVENT_TYPES = new Set([
  'm.room.create',
  'm.room.message',
  'm.room.encrypted',
  'm.room.member',
  'm.sticker',
  'm.reaction',
]);
export const isNotificationEvent = (mEvent: MatrixEvent, room?: Room, userId?: string) => {
  const eType = mEvent.getType();
  if (!NOTIFICATION_EVENT_TYPES.has(eType)) {
    return false;
  }
  if (eType === 'm.room.member') return false;

  if (mEvent.isRedacted()) return false;
  const relation = mEvent.getRelation();
  const relationType = relation?.rel_type;

  // Filter out edits - they shouldn't count as new notifications
  if (relationType === 'm.replace') return false;

  // For reactions: only count them if they're reactions to the current user's messages
  if (relationType === 'm.annotation') {
    if (!room || !userId || !relation) {
      // If we don't have room/userId/relation context, filter out all reactions (safe default)
      return false;
    }
    // Get the event being reacted to
    const reactedToEventId = relation.event_id;
    if (!reactedToEventId) return false;

    const reactedToEvent = room.findEventById(reactedToEventId);
    // Only count as notification if the reacted-to message was sent by current user
    return reactedToEvent?.getSender() === userId;
  }

  return true;
};

export const roomHaveNotification = (room: Room): boolean => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);

  return total > 0 || highlight > 0;
};

export const roomHaveUnread = (mx: MatrixClient, room: Room) => {
  if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return false;
  const userId = mx.getUserId();
  if (!userId) return false;
  const readUpToId = room.getEventReadUpTo(userId);
  const liveEvents = room.getLiveTimeline().getEvents();

  if (!readUpToId) {
    return false;
  }

  const latestEvent = liveEvents[liveEvents.length - 1];

  if (latestEvent?.getSender() === userId) {
    return false;
  }

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) return false;
    if (event.getId() === readUpToId) {
      return false;
    }
    if (isNotificationEvent(event, room, userId)) {
      return true;
    }
  }
  return false;
};

type UnreadInfoOptions = {
  applyFixup?: boolean;
  mDirects?: Set<string>;
};

const unreadInfoFixupInProgress = new WeakSet<Room>();

export const getUnreadInfo = (room: Room, options?: UnreadInfoOptions): UnreadInfo => {
  if (getNotificationType(room.client, room.roomId) === NotificationType.Mute) {
    return { roomId: room.roomId, highlight: 0, total: 0 };
  }

  const userId = room.client.getUserId();
  if (userId && options?.applyFixup && !unreadInfoFixupInProgress.has(room)) {
    unreadInfoFixupInProgress.add(room);
    try {
      room.fixupNotifications(userId);
    } finally {
      unreadInfoFixupInProgress.delete(room);
    }
  }

  let total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);

  // Check if this is a DM and what notification type it has (using multiple signals for robustness)
  const isDM = isDMRoom(room, options?.mDirects);
  const notificationType = isDM ? getNotificationType(room.client, room.roomId) : undefined;
  const shouldForceDMHighlight =
    isDM &&
    notificationType !== NotificationType.Mute &&
    notificationType !== NotificationType.MentionsAndKeywords;

  // If our latest main-timeline notification event is confirmed read, clamp its stale count.
  // Only apply to the room (non-thread) portion so thread reply counts are preserved.
  // Guard: only clamp when the room has NO receipt-confirmed unread events; if roomHaveUnread
  // is true then there genuinely are unread messages and the SDK count is not fully stale.
  if (userId && total > 0 && highlight === 0 && !roomHaveUnread(room.client, room)) {
    const roomTotal = room.getRoomUnreadNotificationCount(NotificationCountType.Total);
    if (roomTotal > 0) {
      const liveEvents = room.getLiveTimeline().getEvents();
      // Exclude the user's own messages: own sent events are always "read" (hasUserReadEvent
      // returns true for them), which would cause the clamp to fire incorrectly.
      const latestNotification = [...liveEvents]
        .toReversed()
        .find(
          (event) =>
            !event.isSending() &&
            event.getSender() !== userId &&
            isNotificationEvent(event, room, userId)
        );
      const latestNotificationId = latestNotification?.getId();
      if (latestNotificationId && room.hasUserReadEvent(userId, latestNotificationId)) {
        // Subtract only the stale main-timeline count; thread totals remain intact.
        total -= roomTotal;
      }
    }
  }

  // Fallback: SDK counters are stale/zero but there are receipt-confirmed unread
  // messages. Walk the live timeline to compute real counts so the badge number
  // and highlight colour reflect actual state rather than a hard-coded stub.
  if (total === 0 && highlight === 0 && userId && roomHaveUnread(room.client, room)) {
    const readUpToId = room.getEventReadUpTo(userId);
    const liveEvents = room.getLiveTimeline().getEvents();
    let fallbackTotal = 0;
    let fallbackHighlight = 0;
    const pushProcessor = new PushProcessor(room.client);
    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      const event = liveEvents[i];
      if (!event) break;
      if (event.getId() === readUpToId) break;
      if (isNotificationEvent(event, room, userId) && event.getSender() !== userId) {
        fallbackTotal += 1;
        const pushActions = pushProcessor.actionsForEvent(event);
        if (pushActions?.tweaks?.highlight) fallbackHighlight += 1;
      }
    }
    if (fallbackTotal > 0) {
      return {
        roomId: room.roomId,
        highlight: fallbackHighlight,
        total: fallbackTotal,
      };
    }
  }

  // Sliding sync limitation: unvisited rooms don't have read receipt data, but may have
  // timeline activity. Check for notification events from others in the timeline to show a
  // badge even when SDK counts are 0 (or unreliable without receipts).
  if (userId) {
    const readUpToId = room.getEventReadUpTo(userId);

    // If we have no read receipt, SDK counts may be unreliable. Always check timeline.
    if (!readUpToId) {
      const liveEvents = room.getLiveTimeline().getEvents();

      const hasActivity = liveEvents.some(
        (event) => event.getSender() !== userId && isNotificationEvent(event, room, userId)
      );

      if (hasActivity) {
        // If SDK already has counts, use those. Otherwise show dot badge (count=1).
        if (total === 0 && highlight === 0) {
          return { roomId: room.roomId, highlight: 0, total: 1 };
        }
        // SDK has counts but no receipt - trust the counts and show them
        return { roomId: room.roomId, highlight, total };
      }
    }
  }

  // For DMs with Default or AllMessages notification type: if there are unread messages,
  // ensure we show a notification badge (treat as highlight for badge color purposes).
  // This handles cases where push rules don't properly match (e.g., classic sync with
  // member_count condition failures, or sliding sync with limited required_state).
  if (shouldForceDMHighlight && total > 0 && highlight === 0) {
    return {
      roomId: room.roomId,
      highlight: total, // Treat all unread messages as highlights for DMs
      total,
    };
  }

  return {
    roomId: room.roomId,
    highlight,
    total: Math.max(total, highlight),
  };
};

export const getUnreadInfos = (mx: MatrixClient, options?: UnreadInfoOptions): UnreadInfo[] => {
  const unreadInfos = mx.getRooms().reduce<UnreadInfo[]>((unread, room) => {
    if (room.isSpaceRoom()) return unread;
    if (room.getMyMembership() !== 'join') return unread;
    if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return unread;

    // Always call getUnreadInfo - it has fallback logic for sliding sync rooms without receipts
    const unreadInfo = getUnreadInfo(room, options);
    if (unreadInfo.total > 0 || unreadInfo.highlight > 0) {
      unread.push(unreadInfo);
    }

    return unread;
  }, []);

  return unreadInfos;
};

export const getRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getMxcAvatarUrl();
  return mxcUrl
    ? (mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ??
        undefined)
    : undefined;
};

export const getDirectRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getAvatarFallbackMember()?.getMxcAvatarUrl();

  if (!mxcUrl) {
    return getRoomAvatarUrl(mx, room, size, useAuthentication);
  }

  return (
    mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ?? undefined
  );
};

export const trimReplyFromBody = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

export const trimReplyFromFormattedBody = (formattedBody: string): string => {
  const suffix = '</mx-reply>';
  const i = formattedBody.lastIndexOf(suffix);
  if (i < 0) {
    return formattedBody;
  }
  return formattedBody.slice(i + suffix.length);
};

export const parseReplyBody = (userId: string, body: string) =>
  `> <${userId}> ${body.replace(/\n/g, '\n> ')}\n\n`;

export const parseReplyFormattedBody = (
  roomId: string,
  userId: string,
  eventId: string,
  formattedBody: string
): string => {
  const replyToLink = `<a href="https://matrix.to/#/${encodeURIComponent(
    roomId
  )}/${encodeURIComponent(eventId)}">In reply to</a>`;
  const userLink = `<a href="https://matrix.to/#/${encodeURIComponent(userId)}">${userId}</a>`;

  return `<mx-reply><blockquote>${replyToLink}${userLink}<br />${formattedBody}</blockquote></mx-reply>`;
};

export const getMemberDisplayName = (
  room: Room,
  userId: string,
  nicknames?: Record<string, string>
): string | undefined => {
  if (nicknames?.[userId]) return nicknames[userId];
  const member = room.getMember(userId);
  const name = member?.rawDisplayName;
  if (name === userId) return undefined;
  if (
    name?.replace(
      // oxlint-disable-next-line no-misleading-character-class -- Stripping invisible formatting characters from display names
      /[\p{Cc}\p{Cf}\u180B-\u180F\uFE00-\uFE0F\u200B-\u200D\t\n ]/gu,
      ''
    ).length === 0
  )
    return undefined;
  return name;
};

export const getMemberSearchStr = (
  member: RoomMember,
  query: string,
  mxIdToName: (mxId: string) => string
): string[] => [
  member.rawDisplayName === member.userId ? mxIdToName(member.userId) : member.rawDisplayName,
  query.startsWith('@') || query.indexOf(':') > -1 ? member.userId : mxIdToName(member.userId),
];

export const getMemberAvatarMxc = (room: Room, userId: string): string | undefined => {
  const member = room.getMember(userId);
  return member?.getMxcAvatarUrl();
};

export const isMembershipChanged = (mEvent: MatrixEvent): boolean =>
  mEvent.getContent().membership !== mEvent.getPrevContent().membership ||
  mEvent.getContent().reason !== mEvent.getPrevContent().reason;

export const decryptAllTimelineEvent = async (mx: MatrixClient, timeline: EventTimeline) => {
  const crypto = mx.getCrypto();
  if (!crypto) return;
  const decryptionPromises = timeline
    .getEvents()
    .filter((event) => event.isEncrypted())
    .toReversed()
    .map((event) => event.attemptDecryption(crypto as CryptoBackend, { isRetry: true }));
  const decryptStart = performance.now();
  await Sentry.startSpan(
    {
      name: 'decrypt.bulk',
      op: 'matrix.crypto',
      attributes: { event_count: decryptionPromises.length },
    },
    () => Promise.allSettled(decryptionPromises)
  );
  if (decryptionPromises.length > 0) {
    Sentry.metrics.distribution(
      'sable.decryption.bulk_latency_ms',
      performance.now() - decryptStart,
      { attributes: { event_count: String(decryptionPromises.length) } }
    );
  }
};

export const getEventReactions = (timelineSet: EventTimelineSet, eventId: string) =>
  timelineSet.relations.getChildEventsForEvent(
    eventId,
    RelationType.Annotation,
    EventType.Reaction
  );

export const getEventEdits = (timelineSet: EventTimelineSet, eventId: string, eventType: string) =>
  timelineSet.relations.getChildEventsForEvent(eventId, RelationType.Replace, eventType);

export const getLatestEdit = (
  targetEvent: MatrixEvent,
  editEvents: MatrixEvent[]
): MatrixEvent | undefined => {
  const eventByTargetSender = (rEvent: MatrixEvent) =>
    rEvent.getSender() === targetEvent.getSender();
  return editEvents.toSorted((m1, m2) => m2.getTs() - m1.getTs()).find(eventByTargetSender);
};

export const getEditedEvent = (
  mEventId: string,
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet
): MatrixEvent | undefined => {
  const edits = getEventEdits(timelineSet, mEventId, mEvent.getType());
  return edits && getLatestEdit(mEvent, edits.getRelations());
};

export const isEditEvent = (mEvent: MatrixEvent): boolean => {
  const relType = mEvent.getRelation()?.rel_type;
  if (relType === (RelationType.Replace as string)) return true;
  if (mEvent.getContent()['m.new_content'] !== undefined) return true;
  return false;
};

export const isReactionEvent = (mEvent: MatrixEvent): boolean =>
  mEvent.getType() === (EventType.Reaction as string);

const FORWARDABLE_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage as string,
  EventType.RoomMessageEncrypted as string,
  EventType.Sticker as string,
]);

export const canForwardEvent = (mEvent: MatrixEvent): boolean => {
  if (mEvent.isRedacted()) return false;
  if (isEditEvent(mEvent)) return false;
  if (mEvent.getType() === (EventType.RoomRedaction as string)) return false;
  if (isReactionEvent(mEvent)) return false;
  if (typeof mEvent.getStateKey() === 'string') return false;
  if (mEvent.isRedaction()) return false;
  return FORWARDABLE_EVENT_TYPES.has(mEvent.getType());
};

export const getReactionKey = (mEvent: MatrixEvent): string | undefined => {
  const key = mEvent.getRelation()?.key;
  if (typeof key === 'string' && key.length > 0) return key;

  const contentRelatesTo = mEvent.getContent()['m.relates_to'] as { key?: string } | undefined;
  if (typeof contentRelatesTo?.key === 'string' && contentRelatesTo.key.length > 0) {
    return contentRelatesTo.key;
  }

  const originalRelatesTo = mEvent.getOriginalContent?.()?.['m.relates_to'] as
    | { key?: string }
    | undefined;
  if (typeof originalRelatesTo?.key === 'string' && originalRelatesTo.key.length > 0) {
    return originalRelatesTo.key;
  }

  return undefined;
};

const readReactionShortcode = (
  content: Record<string, unknown> | undefined
): string | undefined => {
  if (!content) return undefined;
  const shortcode = content.shortcode ?? content['com.beeper.reaction.shortcode'];
  return typeof shortcode === 'string' && shortcode.length > 0 ? shortcode : undefined;
};

export const getReactionShortcode = (mEvent: MatrixEvent): string | undefined =>
  readReactionShortcode(mEvent.getContent()) ??
  readReactionShortcode(mEvent.getOriginalContent?.());

export const getReactionAnnotationTargetId = (reactionEvent: MatrixEvent): string | undefined => {
  const eventId = reactionEvent.getRelation()?.event_id;
  if (typeof eventId === 'string' && eventId.length > 0) return eventId;

  const contentRelatesTo = reactionEvent.getContent()['m.relates_to'] as
    | { event_id?: string }
    | undefined;
  if (typeof contentRelatesTo?.event_id === 'string' && contentRelatesTo.event_id.length > 0) {
    return contentRelatesTo.event_id;
  }

  const originalRelatesTo = reactionEvent.getOriginalContent?.()?.['m.relates_to'] as
    | { event_id?: string }
    | undefined;
  if (typeof originalRelatesTo?.event_id === 'string' && originalRelatesTo.event_id.length > 0) {
    return originalRelatesTo.event_id;
  }

  return undefined;
};

export const getRedactionActorId = (mEvent: MatrixEvent): string | undefined => {
  const sender = mEvent.getUnsigned()?.redacted_because?.sender;
  return typeof sender === 'string' && sender.length > 0 ? sender : undefined;
};

export const getRedactionReason = (mEvent: MatrixEvent): string | undefined => {
  const reason = mEvent.getUnsigned()?.redacted_because?.content?.reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
};

export const collectRelationReactionEvents = (
  linkedTimelines: EventTimeline[],
  existingIds: ReadonlySet<string>,
  ignoredUsersSet: Set<string>,
  showReactions: boolean,
  showReactionTombstones: boolean
): { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentTs: number }[] => {
  if (!showReactions && !showReactionTombstones) return [];

  const extras: { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentTs: number }[] = [];
  const seen = new Set(existingIds);

  for (const timeline of linkedTimelines) {
    const timelineSet = timeline.getTimelineSet();
    for (const parent of timeline.getEvents()) {
      const parentId = parent.getId();
      if (!parentId) continue;

      const reactions = getEventReactions(timelineSet, parentId);
      if (!reactions) continue;

      for (const reaction of reactions.getRelations()) {
        const reactionId = reaction.getId();
        if (!reactionId || seen.has(reactionId)) continue;
        seen.add(reactionId);

        const sender = reaction.getSender();
        if (sender && ignoredUsersSet.has(sender)) continue;

        const redacted = reaction.isRedacted();
        if (redacted && !showReactionTombstones) continue;
        if (!redacted && !showReactions) continue;

        extras.push({ mEvent: reaction, timelineSet, parentTs: parent.getTs() });
      }
    }
  }

  return extras;
};

export const collectRelationEditEvents = (
  linkedTimelines: EventTimeline[],
  existingIds: ReadonlySet<string>,
  ignoredUsersSet: Set<string>,
  showEdits: boolean
): { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentTs: number }[] => {
  if (!showEdits) return [];

  const extras: { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentTs: number }[] = [];
  const seen = new Set(existingIds);

  for (const timeline of linkedTimelines) {
    const timelineSet = timeline.getTimelineSet();
    for (const parent of timeline.getEvents()) {
      const parentId = parent.getId();
      if (!parentId || isEditEvent(parent)) continue;

      const edits = getEventEdits(timelineSet, parentId, parent.getType());
      if (!edits) continue;

      for (const editEvent of edits.getRelations()) {
        const editId = editEvent.getId();
        if (!editId || seen.has(editId)) continue;
        seen.add(editId);

        const sender = editEvent.getSender();
        if (sender && ignoredUsersSet.has(sender)) continue;

        extras.push({ mEvent: editEvent, timelineSet, parentTs: parent.getTs() });
      }
    }
  }

  return extras;
};

export const isRedactableMessageType = (type: string): boolean =>
  type === (EventType.RoomMessage as string) ||
  type === (EventType.RoomMessageEncrypted as string) ||
  type === 'm.room.encrypted' ||
  type === (EventType.Sticker as string);

export const getRedactionTargetId = (redactionEvent: MatrixEvent): string | undefined => {
  const redacts = redactionEvent.event?.redacts;
  if (typeof redacts === 'string') return redacts;
  const associated = redactionEvent.getAssociatedId?.();
  return typeof associated === 'string' ? associated : undefined;
};

export const getRedactionTargetEvent = (
  timelineSet: EventTimelineSet,
  redactionEvent: MatrixEvent
): MatrixEvent | undefined => {
  const targetId = getRedactionTargetId(redactionEvent);
  if (!targetId) return undefined;
  return timelineSet.findEventById(targetId);
};

export const shouldShowRedactionTimelineEvent = (
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet,
  hiddenEventRedactionTimeline: boolean,
  hiddenEventReactionRedactionTimeline: boolean
): boolean => {
  if (!mEvent.isRedaction()) return false;
  const target = getRedactionTargetEvent(timelineSet, mEvent);
  if (target?.getType() === (EventType.Reaction as string)) {
    return hiddenEventReactionRedactionTimeline;
  }
  return hiddenEventRedactionTimeline;
};

const readReplaceTargetId = (
  relatesTo: { rel_type?: string; event_id?: string } | undefined
): string | undefined => {
  if (relatesTo?.rel_type !== (RelationType.Replace as string)) return undefined;
  const eventId = relatesTo.event_id;
  return typeof eventId === 'string' && eventId.length > 0 ? eventId : undefined;
};

export const getEditTargetId = (editEvent: MatrixEvent): string | undefined => {
  const relationEventId = editEvent.getRelation()?.event_id;
  if (typeof relationEventId === 'string' && relationEventId.length > 0) {
    return relationEventId;
  }

  const content = editEvent.getContent();
  const fromContent = readReplaceTargetId(
    content['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined
  );
  if (fromContent) return fromContent;

  const wireContent = editEvent.getWireContent?.() as Record<string, unknown> | undefined;
  const fromWire = readReplaceTargetId(
    wireContent?.['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined
  );
  if (fromWire) return fromWire;

  return readReplaceTargetId(
    editEvent.getOriginalContent?.()?.['m.relates_to'] as
      | { rel_type?: string; event_id?: string }
      | undefined
  );
};

export const getEditChain = (
  timelineSet: EventTimelineSet,
  eventId: string,
  eventType: string,
  room?: Room
): { original: MatrixEvent; edits: MatrixEvent[] } | undefined => {
  let original = timelineSet.findEventById(eventId);
  if (!original && room) {
    original = room.findEventById(eventId) ?? undefined;
  }
  if (!original) return undefined;

  const editsRelation = getEventEdits(timelineSet, eventId, original.getType() ?? eventType);
  const edits = editsRelation
    ? [...editsRelation.getRelations()].toSorted((a, b) => a.getTs() - b.getTs())
    : [];
  return { original, edits };
};

const getEditChainEvents = (
  currentEditEvent: MatrixEvent,
  chain: { original: MatrixEvent; edits: MatrixEvent[] }
): MatrixEvent[] => {
  const currentId = currentEditEvent.getId();
  const edits =
    currentId && !chain.edits.some((editEvent) => editEvent.getId() === currentId)
      ? [...chain.edits, currentEditEvent].toSorted((a, b) => a.getTs() - b.getTs())
      : chain.edits;
  return [chain.original, ...edits];
};

export const getPreviousEditId = (
  currentEditEvent: MatrixEvent,
  chain: { original: MatrixEvent; edits: MatrixEvent[] }
): string | undefined => {
  const currentId = currentEditEvent.getId();
  if (!currentId) return undefined;

  const allEvents = getEditChainEvents(currentEditEvent, chain);
  const idx = allEvents.findIndex((e) => e.getId() === currentId);
  if (idx <= 0) return undefined;
  return allEvents[idx - 1]?.getId();
};

export const getPreviousEditEvent = (
  currentEditEvent: MatrixEvent,
  chain: { original: MatrixEvent; edits: MatrixEvent[] }
): MatrixEvent | undefined => {
  const currentId = currentEditEvent.getId();
  if (!currentId) return undefined;

  const allEvents = getEditChainEvents(currentEditEvent, chain);
  const idx = allEvents.findIndex((e) => e.getId() === currentId);
  if (idx <= 0) return undefined;
  return allEvents[idx - 1];
};

const EDIT_DIFF_MSGTYPES = new Set<string>([MsgType.Text, MsgType.Emote, MsgType.Notice]);

export const getMessageVersionBody = (mEvent: MatrixEvent): string | undefined => {
  const content = mEvent.getContent();
  const wireContent = mEvent.getWireContent?.() as Record<string, unknown> | undefined;

  let versionContent: Record<string, unknown> | undefined;
  if (isEditEvent(mEvent)) {
    versionContent =
      (content['m.new_content'] as Record<string, unknown> | undefined) ??
      (wireContent?.['m.new_content'] as Record<string, unknown> | undefined);
  } else {
    versionContent =
      (mEvent.getOriginalContent?.() as Record<string, unknown> | undefined) ??
      (content as Record<string, unknown>);
  }

  const fallbackContent =
    (!versionContent || typeof versionContent.body !== 'string') && mEvent.getOriginalContent?.()
      ? (mEvent.getOriginalContent?.() as Record<string, unknown>)
      : undefined;
  const resolvedContent =
    versionContent && typeof versionContent === 'object' ? versionContent : fallbackContent;
  if (!resolvedContent || typeof resolvedContent !== 'object') return undefined;

  const msgtype = resolvedContent.msgtype;
  if (typeof msgtype === 'string' && !EDIT_DIFF_MSGTYPES.has(msgtype)) {
    return undefined;
  }

  const body = resolvedContent.body;
  return typeof body === 'string' ? trimReplyFromBody(body) : undefined;
};

export const getEditDiffBodies = (
  editEvent: MatrixEvent,
  timelineSet: EventTimelineSet,
  room?: Room
): { oldBody?: string; newBody?: string } => {
  const newBody = getMessageVersionBody(editEvent);
  const editTargetId = getEditTargetId(editEvent);
  if (!editTargetId) {
    return { newBody };
  }

  const chain = getEditChain(timelineSet, editTargetId, editEvent.getType(), room);
  let previousEvent = chain ? getPreviousEditEvent(editEvent, chain) : undefined;
  if (!previousEvent) {
    previousEvent =
      chain?.original ??
      timelineSet.findEventById(editTargetId) ??
      room?.findEventById(editTargetId);
  }

  const oldBody =
    previousEvent && previousEvent.getId() !== editEvent.getId()
      ? getMessageVersionBody(previousEvent)
      : undefined;

  return { oldBody, newBody };
};

export const canEditEvent = (mx: MatrixClient, mEvent: MatrixEvent) => {
  const content = mEvent.getContent();
  const relationType = content['m.relates_to']?.rel_type;
  return (
    mEvent.getSender() === mx.getUserId() &&
    mEvent.getType() === (EventType.RoomMessage as string) &&
    (!relationType || relationType === (RelationType.Thread as string)) &&
    (content.msgtype === MsgType.Text ||
      content.msgtype === MsgType.Emote ||
      content.msgtype === MsgType.Notice ||
      content.msgtype === MsgType.Image ||
      content.msgtype === MsgType.Video ||
      content.msgtype === MsgType.Audio ||
      content.msgtype === MsgType.File)
  );
};

export const getLatestEditableEvt = (
  timeline: EventTimeline,
  canEdit: (mEvent: MatrixEvent) => boolean
): MatrixEvent | undefined => {
  const events = timeline.getEvents();

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (evt && canEdit(evt)) return evt;
  }
  return undefined;
};

export const reactionOrEditEvent = (mEvent: MatrixEvent): boolean => {
  const relType = mEvent.getRelation()?.rel_type;
  if (
    relType === (RelationType.Annotation as string) ||
    relType === (RelationType.Replace as string)
  )
    return true;

  // Sliding sync proxies may omit m.relates_to on the initial delivery of timeline
  // events.  Detect edit events by the presence of m.new_content in the event
  // content even when the relation metadata is absent, so they are filtered from
  // the rendered timeline rather than falling through as unsupported messages.
  if (mEvent.getContent()['m.new_content'] !== undefined) return true;

  return false;
};

export const isThreadRelationEvent = (mEvent: MatrixEvent, threadRootId?: string): boolean => {
  const relation =
    mEvent.getRelation?.() ??
    (
      mEvent.getWireContent?.() as {
        'm.relates_to'?: { rel_type?: unknown; event_id?: unknown };
      }
    )?.['m.relates_to'] ??
    (
      mEvent.getContent?.() as {
        'm.relates_to'?: { rel_type?: unknown; event_id?: unknown };
      }
    )?.['m.relates_to'];

  return (
    relation?.rel_type === (RelationType.Thread as string) &&
    (threadRootId === undefined || relation.event_id === threadRootId)
  );
};

export const hasThreadRootAggregation = (mEvent: MatrixEvent): boolean =>
  (mEvent.getServerAggregatedRelation?.<IThreadBundledRelationship>(RelationType.Thread as string)
    ?.count ?? 0) > 0;

/**
 * Timeline rows skip reactions, edits, and other relation-only events.  When jumping
 * to a reply target, unwrap to the event that is actually rendered (root of an
 * edit chain, message for a reaction annotation, etc.).
 */
export const unwrapRelationJumpTarget = (room: Room, eventId: string, maxHops = 24): string => {
  let current = eventId;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const ev = room.findEventById(current);
    if (!ev) return current;
    if (!reactionOrEditEvent(ev)) return current;
    const related = ev.getRelation()?.event_id;
    if (typeof related !== 'string' || related === current) return current;
    current = related;
  }
  return current;
};

const findRelationChildEvent = (
  timelineSet: EventTimelineSet,
  eventId: string
): MatrixEvent | undefined => {
  for (const timeline of timelineSet.getTimelines()) {
    for (const parent of timeline.getEvents()) {
      const parentId = parent.getId();
      if (!parentId) continue;

      const reactionRelations = getEventReactions(timelineSet, parentId);
      if (reactionRelations) {
        const reaction = reactionRelations
          .getRelations()
          .find((candidate) => candidate.getId() === eventId);
        if (reaction) return reaction;
      }

      const editRelations = getEventEdits(timelineSet, parentId, parent.getType());
      if (editRelations) {
        const edit = editRelations
          .getRelations()
          .find((candidate) => candidate.getId() === eventId);
        if (edit) return edit;
      }
    }
  }
  return undefined;
};

export const findRoomEventById = (
  room: Room,
  eventId: string,
  timelineSet?: EventTimelineSet
): MatrixEvent | undefined => {
  const set = timelineSet ?? room.getUnfilteredTimelineSet();
  return (
    set.findEventById(eventId) ??
    room.findEventById(eventId) ??
    findRelationChildEvent(set, eventId)
  );
};

export type ResolvedReplyDraftTarget = {
  eventId: string;
  replyEvt: MatrixEvent;
};

export const extractReplyDraftBody = (
  replyEvt: MatrixEvent,
  timelineSet: EventTimelineSet
): { body: string; formattedBody: string } => {
  const replyId = replyEvt.getId();
  const editedReply =
    replyId !== undefined && !isEditEvent(replyEvt)
      ? getEditedEvent(replyId, replyEvt, timelineSet)
      : undefined;
  const editedNewContent = editedReply?.getContent()['m.new_content'];
  const content = (editedNewContent ?? replyEvt.getContent()) as Record<string, unknown>;
  const { body, formatted_body: formattedBody } = content;
  const msc1767body = content['m.text'];

  const resolvedBody =
    (typeof body === 'string' ? body : undefined) ??
    (typeof msc1767body === 'string'
      ? msc1767body
      : (msc1767body as { body?: string } | undefined)?.body) ??
    getMessageVersionBody(replyEvt) ??
    '';

  return {
    body: resolvedBody,
    formattedBody: typeof formattedBody === 'string' ? formattedBody : '',
  };
};

export const resolveReplyDraftTarget = (
  room: Room,
  clickedEventId: string,
  timelineSet?: EventTimelineSet
): ResolvedReplyDraftTarget | undefined => {
  const set = timelineSet ?? room.getUnfilteredTimelineSet();
  const replyEvt = findRoomEventById(room, clickedEventId, set);
  if (!replyEvt) return undefined;

  const eventId = replyEvt.getId();
  if (!eventId) return undefined;

  return { eventId, replyEvt };
};

export const getMentionContent = (userIds: string[], room: boolean): IMentions => {
  const mMentions: IMentions = {};
  if (userIds.length > 0) {
    mMentions.user_ids = userIds;
  }
  if (room) {
    mMentions.room = true;
  }

  return mMentions;
};

export const getCommonRooms = (
  mx: MatrixClient,
  rooms: string[],
  otherUserId: string
): string[] => {
  const commonRooms: string[] = [];

  rooms.forEach((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== (KnownMembership.Join as string)) return;

    const common = room.hasMembershipState(otherUserId, KnownMembership.Join);
    if (common) {
      commonRooms.push(roomId);
    }
  });

  return commonRooms;
};

export const bannedInRooms = (mx: MatrixClient, rooms: string[], otherUserId: string): boolean =>
  rooms.some((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== (KnownMembership.Join as string)) return false;

    return room.hasMembershipState(otherUserId, KnownMembership.Ban);
  });

export const getAllVersionsRoomCreator = (room: Room): Set<string> => {
  const creators = new Set<string>();

  const createEvent = getStateEvent(room, EventType.RoomCreate);
  const createContent = createEvent?.getContent<IRoomCreateContent>();
  const creator = createEvent?.getSender();
  if (typeof creator === 'string') creators.add(creator);

  if (createContent && Array.isArray(createContent.additional_creators)) {
    createContent.additional_creators.forEach((c) => {
      creators.add(c);
    });
  }

  return creators;
};

export const guessPerfectParent = (
  mx: MatrixClient,
  roomId: string,
  parents: string[]
): string | undefined => {
  if (parents.length === 1) {
    return parents[0];
  }

  const getSpecialUsers = (rId: string): string[] => {
    const specialUsers: Set<string> = new Set();

    const r = mx.getRoom(rId);
    if (!r) return [];

    getAllVersionsRoomCreator(r).forEach((c) => specialUsers.add(c));

    const powerLevels = getStateEvent(
      r,
      EventType.RoomPowerLevels
    )?.getContent<IPowerLevelsContent>();

    const { users_default: usersDefault, users } = powerLevels ?? {};
    const defaultPower = typeof usersDefault === 'number' ? usersDefault : 0;

    if (typeof users === 'object')
      Object.keys(users).forEach((userId) => {
        if (users[userId]! > defaultPower) {
          specialUsers.add(userId);
        }
      });

    return Array.from(specialUsers);
  };

  let perfectParent: string | undefined;
  let score = 0;

  const roomSpecialUsers = getSpecialUsers(roomId);
  parents.forEach((parentId) => {
    const parentSpecialUsers = getSpecialUsers(parentId);
    const matchedUsersCount = parentSpecialUsers.filter((userId) =>
      roomSpecialUsers.includes(userId)
    ).length;

    if (matchedUsersCount > score) {
      score = matchedUsersCount;
      perfectParent = parentId;
    }
  });

  return perfectParent;
};
