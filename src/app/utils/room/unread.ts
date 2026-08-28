import type { IPushRule, IPushRules, MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import {
  Direction,
  EventType,
  NotificationCountType,
  PushRuleActionName,
  ReceiptType,
  RelationType,
} from '$types/matrix-sdk';

import type { UnreadInfo } from '$types/matrix/room';
import { NotificationType } from '$types/matrix/room';

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

export const isDMRoom = (room: Room, mDirects?: Set<string>): boolean => {
  if (mDirects?.has(room.roomId)) return true;
  // Fallback for DMs missing from m.direct account data.
  return !room.isSpaceRoom() && room.getJoinedMemberCount() === 2;
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

  if (roomPushRule.actions[0] === PushRuleActionName.Notify) return NotificationType.AllMessages;
  return NotificationType.MentionsAndKeywords;
};

const NOTIFICATION_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage,
  EventType.RoomMessageEncrypted,
  EventType.Sticker,
  EventType.Reaction,
]);
export const isNotificationEvent = (mEvent: MatrixEvent, room?: Room, userId?: string) => {
  if (!NOTIFICATION_EVENT_TYPES.has(mEvent.getType())) return false;
  if (mEvent.isRedacted()) return false;

  const relation = mEvent.getRelation();
  const relationType = relation?.rel_type;
  if (relationType === RelationType.Replace) return false;

  if (relationType === RelationType.Annotation) {
    // Without context we cannot tell whose message was reacted to, so ignore it.
    if (!room || !userId || !relation?.event_id) return false;
    return room.findEventById(relation.event_id)?.getSender() === userId;
  }

  return true;
};

export const roomHaveNotification = (room: Room): boolean => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);

  return total > 0 || highlight > 0;
};

export const getFullyReadEventId = (room: Room): string | undefined =>
  room.getAccountData(EventType.FullyRead)?.getContent<{ event_id?: string }>()?.event_id;

// m.fully_read is a boundary too: the receipt can be gone after a restart.
export const getReadBoundaryEventId = (room: Room, userId: string): string | undefined => {
  const receiptId = room.getEventReadUpTo(userId) ?? undefined;
  const fullyReadId = getFullyReadEventId(room);
  if (!fullyReadId || receiptId === fullyReadId) return receiptId;

  // Only trust the marker if it is actually loaded.
  const liveEvents = room.getLiveTimeline().getEvents();
  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const eventId = liveEvents[i]?.getId();
    if (eventId === receiptId) return receiptId;
    if (eventId === fullyReadId) return fullyReadId;
  }
  return receiptId;
};

export const roomHaveUnread = (mx: MatrixClient, room: Room) => {
  if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return false;
  const userId = mx.getUserId();
  if (!userId) return false;
  const readUpToId = getReadBoundaryEventId(room, userId);
  const liveEvents = room.getLiveTimeline().getEvents();

  if (!readUpToId) {
    return false;
  }

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) return false;
    if (event.getId() === readUpToId) {
      return false;
    }
    if (event.getSender() === userId) {
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

export const hasAnyReadReceipt = (room: Room, userId: string): boolean =>
  !!room.getReadReceiptForUserId(userId) ||
  !!room.getReadReceiptForUserId(userId, false, ReceiptType.ReadPrivate);

export const isTimelineExhausted = (room: Room): boolean =>
  !room.getLiveTimeline().getPaginationToken(Direction.Backward);

// Accepts m.fully_read as evidence when the receipt is missing or lags behind it.
export const hasReadEvent = (room: Room, userId: string, eventId: string): boolean => {
  if (room.hasUserReadEvent(userId, eventId)) return true;

  const fullyReadId = getFullyReadEventId(room);
  if (!fullyReadId) return false;

  const liveEvents = room.getLiveTimeline().getEvents();
  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const currentId = liveEvents[i]?.getId();
    // Walking backwards, the marker wins only if it sits at or after the event.
    if (currentId === fullyReadId) return true;
    if (currentId === eventId) return false;
  }
  return false;
};

export const isReadBoundaryLoaded = (room: Room, userId: string): boolean => {
  const readUpToId = room.getEventReadUpTo(userId);
  if (readUpToId && room.findEventById(readUpToId)) return true;
  const fullyReadEventId = getFullyReadEventId(room);
  if (fullyReadEventId && room.findEventById(fullyReadEventId)) return true;
  return isTimelineExhausted(room);
};

type TimelineUnreadOptions = {
  boundaryEventId?: string | null;
  stopAtOwnEvent?: boolean;
};

export const countTimelineUnread = (
  room: Room,
  userId: string,
  options: TimelineUnreadOptions = {}
): { total: number; highlight: number } => {
  const { boundaryEventId, stopAtOwnEvent = false } = options;
  let total = 0;
  let highlight = 0;
  const pushProcessor = room.client.pushProcessor;
  const liveEvents = room.getLiveTimeline().getEvents();
  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) break;
    if (boundaryEventId && event.getId() === boundaryEventId) break;
    if (event.getSender() === userId) {
      if (stopAtOwnEvent) break;
      continue;
    }
    if (isNotificationEvent(event, room, userId)) {
      total += 1;
      const pushActions = pushProcessor?.actionsForEvent(event);
      if (pushActions?.tweaks?.highlight) highlight += 1;
    }
  }
  return { total, highlight };
};

type Counts = { total: number; highlight: number };

// Clamps only the room portion so thread reply counts survive.
const clampStaleCounts = (room: Room, userId: string, counts: Counts): Counts => {
  const roomTotal = room.getRoomUnreadNotificationCount(NotificationCountType.Total);
  if (roomTotal === 0) return counts;

  // Own sent events always read as read, which would clamp incorrectly.
  const latestNotification = room
    .getLiveTimeline()
    .getEvents()
    .toReversed()
    .find(
      (event) =>
        !event.isSending() &&
        event.getSender() !== userId &&
        isNotificationEvent(event, room, userId)
    );
  const latestNotificationId = latestNotification?.getId();
  if (!latestNotificationId || !hasReadEvent(room, userId, latestNotificationId)) return counts;

  return {
    total: counts.total - roomTotal,
    highlight:
      counts.highlight - room.getRoomUnreadNotificationCount(NotificationCountType.Highlight),
  };
};

const countFromBoundary = (room: Room, userId: string): UnreadInfo | undefined => {
  const boundaryId = getReadBoundaryEventId(room, userId);
  const counted = countTimelineUnread(room, userId, { boundaryEventId: boundaryId });
  if (counted.total === 0) return undefined;

  const countIsExact =
    !!(boundaryId && room.findEventById(boundaryId)) || isTimelineExhausted(room);
  return {
    roomId: room.roomId,
    highlight: counted.highlight,
    total: counted.total,
    estimated: !countIsExact,
  };
};

const scanForActivity = (
  room: Room,
  userId: string,
  fullyReadEventId: string | undefined
): { hasActivity: boolean; foundReadBoundary: boolean } => {
  const liveEvents = room.getLiveTimeline().getEvents();
  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) break;
    if (event.getId() === fullyReadEventId || event.getSender() === userId) {
      return { hasActivity: false, foundReadBoundary: true };
    }
    if (isNotificationEvent(event, room, userId)) {
      return { hasActivity: true, foundReadBoundary: false };
    }
  }
  return { hasActivity: false, foundReadBoundary: false };
};

// Rooms unvisited under sliding sync have no receipt, so SDK counts are unreliable.
const estimateWithoutReceipt = (
  room: Room,
  userId: string,
  { total, highlight }: Counts
): UnreadInfo | undefined => {
  const fullyReadEventId = getFullyReadEventId(room);
  const { hasActivity, foundReadBoundary } = scanForActivity(room, userId, fullyReadEventId);
  const boundaryKnown = foundReadBoundary || isReadBoundaryLoaded(room, userId);
  const hasDistantReadEvidence =
    !boundaryKnown && (!!fullyReadEventId || hasAnyReadReceipt(room, userId));
  if (!hasActivity && !hasDistantReadEvidence) return undefined;

  if (total > 0 || highlight > 0) {
    return hasActivity ? { roomId: room.roomId, highlight, total } : undefined;
  }

  if (boundaryKnown) {
    const counted = countTimelineUnread(room, userId, {
      boundaryEventId: fullyReadEventId,
      stopAtOwnEvent: true,
    });
    if (counted.total === 0 && counted.highlight === 0) return undefined;
    return { roomId: room.roomId, highlight: counted.highlight, total: counted.total };
  }
  if (hasActivity && !fullyReadEventId) {
    // No read evidence at all: dot badge with an unknown real count.
    return { roomId: room.roomId, highlight: 0, total: 1, estimated: true };
  }
  // Cannot prove unread state until the distant boundary is loaded.
  return { roomId: room.roomId, highlight: 0, total: 0, estimated: true };
};

// Push rules can fail to match a DM, so unread DMs are badged as highlights regardless.
const shouldForceDMHighlight = (room: Room, mDirects?: Set<string>): boolean => {
  if (!isDMRoom(room, mDirects)) return false;
  const notificationType = getNotificationType(room.client, room.roomId);
  return (
    notificationType !== NotificationType.Mute &&
    notificationType !== NotificationType.MentionsAndKeywords
  );
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

  let counts: Counts = {
    total: room.getUnreadNotificationCount(NotificationCountType.Total),
    highlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
  };

  let cachedTimelineUnread: boolean | undefined;
  const hasTimelineUnread = () => {
    cachedTimelineUnread ??= roomHaveUnread(room.client, room);
    return cachedTimelineUnread;
  };

  if (userId && counts.total > 0 && !hasTimelineUnread()) {
    counts = clampStaleCounts(room, userId, counts);
  }

  if (userId && counts.total === 0 && counts.highlight === 0 && hasTimelineUnread()) {
    const counted = countFromBoundary(room, userId);
    if (counted) return counted;
  }

  if (userId && !room.getEventReadUpTo(userId)) {
    const estimated = estimateWithoutReceipt(room, userId, counts);
    if (estimated) return estimated;
  }

  const { total, highlight } = counts;
  if (total > 0 && highlight === 0 && shouldForceDMHighlight(room, options?.mDirects)) {
    return { roomId: room.roomId, highlight: total, total };
  }

  return {
    roomId: room.roomId,
    highlight,
    total: Math.max(total, highlight),
  };
};

const tracksUnread = (mx: MatrixClient, room: Room): boolean =>
  room.getMyMembership() === 'join' &&
  getNotificationType(mx, room.roomId) !== NotificationType.Mute;

const hasUnread = (unreadInfo: UnreadInfo): boolean =>
  unreadInfo.total > 0 || unreadInfo.highlight > 0;

export const getUnreadInfos = (mx: MatrixClient, options?: UnreadInfoOptions): UnreadInfo[] =>
  mx.getRooms().reduce<UnreadInfo[]>((unread, room) => {
    if (room.isSpaceRoom() || !tracksUnread(mx, room)) return unread;

    const unreadInfo = getUnreadInfo(room, options);
    if (hasUnread(unreadInfo)) unread.push(unreadInfo);
    return unread;
  }, []);

export const getUnreadInfosForRooms = (
  mx: MatrixClient,
  roomIds: Iterable<string>,
  options?: UnreadInfoOptions
): { unread: UnreadInfo[]; deleted: string[] } => {
  const unread: UnreadInfo[] = [];
  const deleted: string[] = [];

  for (const roomId of roomIds) {
    const room = mx.getRoom(roomId);
    if (!room) {
      deleted.push(roomId);
      continue;
    }
    // Space unread is derived from children in the atom reducer; skip like
    // getUnreadInfos rather than deleting.
    if (room.isSpaceRoom()) continue;
    if (!tracksUnread(mx, room)) {
      deleted.push(roomId);
      continue;
    }

    const unreadInfo = getUnreadInfo(room, options);
    if (hasUnread(unreadInfo)) {
      unread.push(unreadInfo);
    } else {
      deleted.push(roomId);
    }
  }

  return { unread, deleted };
};
