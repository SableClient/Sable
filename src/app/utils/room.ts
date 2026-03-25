import { IconName, IconSrc } from 'folds';

import {
  EventTimeline,
  EventTimelineSet,
  EventType,
  IMentions,
  IPowerLevelsContent,
  IPushRule,
  IPushRules,
  JoinRule,
  MatrixClient,
  MatrixEvent,
  NotificationCountType,
  PushProcessor,
  RelationType,
  Room,
  RoomMember,
  CryptoBackend,
  MsgType,
} from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import {
  IRoomCreateContent,
  Membership,
  NotificationType,
  RoomToParents,
  RoomType,
  MessageEvent,
  StateEvent,
  UnreadInfo,
} from '$types/matrix/room';
import * as Sentry from '@sentry/react';

export const getStateEvent = (
  room: Room,
  eventType: StateEvent,
  stateKey = ''
): MatrixEvent | undefined =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType, stateKey) ??
  undefined;

export const getStateEvents = (room: Room, eventType: StateEvent): MatrixEvent[] =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType) ?? [];

export const getAccountData = (
  mx: MatrixClient,
  eventType: AccountDataEvent
): MatrixEvent | undefined => mx.getAccountData(eventType as any);

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
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return false;
  return event.getContent().type === RoomType.Space;
};

export const isRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true;
  return event.getContent().type !== RoomType.Space;
};

export const isUnsupportedRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
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
    mEvent.getType() === StateEvent.SpaceChild &&
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
  getStateEvents(room, StateEvent.SpaceChild).reduce<string[]>((filtered, mEvent) => {
    const stateKey = mEvent.getStateKey();
    if (isValidChild(mEvent) && stateKey) {
      filtered.push(stateKey);
    }
    return filtered;
  }, []);

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
    .filter((room) => isSpace(room) && room.getMyMembership() === Membership.Join)
    .forEach((room) => mapParentWithChildren(map, room.roomId, getSpaceChildren(room)));

  return map;
};

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  return Array.from(parents).filter((parentRoomId) => !roomToParents.has(parentRoomId));
};

export const isMutedRule = (rule: IPushRule) =>
  // Check for empty actions (new spec) or dont_notify (deprecated)
  (rule.actions.length === 0 || rule.actions[0] === 'dont_notify') &&
  rule.conditions?.[0]?.kind === 'event_match';

export const findMutedRule = (overrideRules: IPushRule[], roomId: string) =>
  overrideRules.find((rule) => rule.rule_id === roomId && isMutedRule(rule));

export const getNotificationType = (mx: MatrixClient, roomId: string): NotificationType => {
  let roomPushRule: IPushRule | undefined;
  try {
    roomPushRule = mx.getRoomPushRule('global', roomId);
  } catch {
    roomPushRule = undefined;
  }

  if (!roomPushRule) {
    const overrideRules = mx.getAccountData(EventType.PushRules)?.getContent<IPushRules>()
      ?.global?.override;
    if (!overrideRules) return NotificationType.Default;

    return findMutedRule(overrideRules, roomId) ? NotificationType.Mute : NotificationType.Default;
  }

  if (roomPushRule.actions[0] === 'notify') return NotificationType.AllMessages;
  return NotificationType.MentionsAndKeywords;
};

const NOTIFICATION_EVENT_TYPES = [
  'm.room.create',
  'm.room.message',
  'm.room.encrypted',
  'm.room.member',
  'm.sticker',
  'm.reaction',
];
export const isNotificationEvent = (mEvent: MatrixEvent, room?: Room, userId?: string) => {
  const eType = mEvent.getType();
  if (!NOTIFICATION_EVENT_TYPES.includes(eType)) {
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

export const getUnreadInfo = (room: Room, options?: UnreadInfoOptions): UnreadInfo => {
  const userId = room.client.getUserId();
  if (userId && options?.applyFixup) {
    // Reconcile known notification-count drift (notably with Sliding Sync / mixed receipts).
    room.fixupNotifications(userId);
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
        .reverse()
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
      return { roomId: room.roomId, highlight: fallbackHighlight, total: fallbackTotal };
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

export const getRoomIconSrc = (
  icons: Record<IconName, IconSrc>,
  roomType?: string,
  joinRule?: JoinRule
): IconSrc => {
  if (roomType === RoomType.Space) {
    if (joinRule === JoinRule.Public) return icons.SpaceGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.SpaceLock;
    }
    return icons.Space;
  }

  if (roomType === RoomType.Call) {
    if (joinRule === JoinRule.Public) return icons.VolumeHighGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.VolumeHighLock;
    }
    return icons.VolumeHigh;
  }

  if (joinRule === JoinRule.Public) return icons.HashGlobe;
  if (
    joinRule === JoinRule.Invite ||
    joinRule === JoinRule.Knock ||
    joinRule === JoinRule.Private
  ) {
    return icons.HashLock;
  }
  return icons.Hash;
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
    .reverse()
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

export const getReactionContent = (eventId: string, key: string, shortcode?: string) => ({
  'm.relates_to': {
    event_id: eventId,
    key,
    rel_type: 'm.annotation',
  },
  shortcode,
});

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
  return editEvents.sort((m1, m2) => m2.getTs() - m1.getTs()).find(eventByTargetSender);
};

export const getEditedEvent = (
  mEventId: string,
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet
): MatrixEvent | undefined => {
  const edits = getEventEdits(timelineSet, mEventId, mEvent.getType());
  return edits && getLatestEdit(mEvent, edits.getRelations());
};

export const canEditEvent = (mx: MatrixClient, mEvent: MatrixEvent) => {
  const content = mEvent.getContent();
  const relationType = content['m.relates_to']?.rel_type;
  return (
    mEvent.getSender() === mx.getUserId() &&
    mEvent.getType() === MessageEvent.RoomMessage &&
    (!relationType || relationType === RelationType.Thread) &&
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
    if (canEdit(evt)) return evt;
  }
  return undefined;
};

export const reactionOrEditEvent = (mEvent: MatrixEvent): boolean => {
  const relType = mEvent.getRelation()?.rel_type;
  if (relType === RelationType.Annotation || relType === RelationType.Replace) return true;

  // Sliding sync proxies may omit m.relates_to on the initial delivery of timeline
  // events.  Detect edit events by the presence of m.new_content in the event
  // content even when the relation metadata is absent, so they are filtered from
  // the rendered timeline rather than falling through as unsupported messages.
  if (mEvent.getContent()['m.new_content'] !== undefined) return true;

  return false;
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
    if (!room || room.getMyMembership() !== Membership.Join) return;

    const common = room.hasMembershipState(otherUserId, Membership.Join);
    if (common) {
      commonRooms.push(roomId);
    }
  });

  return commonRooms;
};

export const bannedInRooms = (mx: MatrixClient, rooms: string[], otherUserId: string): boolean =>
  rooms.some((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return false;

    return room.hasMembershipState(otherUserId, Membership.Ban);
  });

export const getAllVersionsRoomCreator = (room: Room): Set<string> => {
  const creators = new Set<string>();

  const createEvent = getStateEvent(room, StateEvent.RoomCreate);
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
      StateEvent.RoomPowerLevels
    )?.getContent<IPowerLevelsContent>();

    const { users_default: usersDefault, users } = powerLevels ?? {};
    const defaultPower = typeof usersDefault === 'number' ? usersDefault : 0;

    if (typeof users === 'object')
      Object.keys(users).forEach((userId) => {
        if (users[userId] > defaultPower) {
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
