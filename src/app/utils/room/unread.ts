import type { IPushRule, IPushRules, MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { EventType, NotificationCountType, PushRuleActionName } from '$types/matrix-sdk';

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
  let hasTimelineUnread: boolean | undefined;
  const roomHasTimelineUnread = () => {
    hasTimelineUnread ??= roomHaveUnread(room.client, room);
    return hasTimelineUnread;
  };

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
  if (userId && total > 0 && highlight === 0 && !roomHasTimelineUnread()) {
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
  if (total === 0 && highlight === 0 && userId && roomHasTimelineUnread()) {
    const readUpToId = room.getEventReadUpTo(userId);
    const liveEvents = room.getLiveTimeline().getEvents();
    let fallbackTotal = 0;
    let fallbackHighlight = 0;
    const pushProcessor = room.client.pushProcessor;
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
      const fullyReadEventId = room
        .getAccountData(EventType.FullyRead)
        ?.getContent<{ event_id?: string }>()?.event_id;
      let hasActivity = false;
      for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
        const event = liveEvents[i];
        if (!event || event.getId() === fullyReadEventId) break;
        if (event.getSender() !== userId && isNotificationEvent(event, room, userId)) {
          hasActivity = true;
          break;
        }
      }

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
    if (room.getMyMembership() !== 'join') {
      deleted.push(roomId);
      continue;
    }
    if (getNotificationType(mx, room.roomId) === NotificationType.Mute) {
      deleted.push(roomId);
      continue;
    }

    const unreadInfo = getUnreadInfo(room, options);
    if (unreadInfo.total > 0 || unreadInfo.highlight > 0) {
      unread.push(unreadInfo);
    } else {
      deleted.push(roomId);
    }
  }

  return { unread, deleted };
};
