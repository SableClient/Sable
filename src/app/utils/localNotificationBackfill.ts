import type { MatrixClient, Room } from '$types/matrix-sdk';
import { Direction, EventType } from '$types/matrix-sdk';
import { NotificationType } from '$types/matrix/room';
import { getLocalNotificationCache } from '$client/localNotificationCache';
import { getAccountData, getStateEvent } from '$utils/room/hierarchy';
import { getMDirects, getNotificationType, getUnreadInfo, isDMRoom } from '$utils/room/unread';
import {
  evaluateNotification,
  isAwaitingDecryption,
  isStoredNotificationRead,
  watchDecryption,
  type NotificationTab,
  type StoredNotification,
} from './localNotifications';

const PAGE_SIZE = 50;
const MAX_PAGES = 5;

export type ScanContentOptions = {
  storeContent: boolean;
  storeEncryptedContent: boolean;
};

type BackfillOptions = {
  includeRead?: boolean;
  signal?: AbortSignal;
  tab?: NotificationTab;
};

const storesContent = (room: Room, options: ScanContentOptions): boolean =>
  getStateEvent(room, EventType.RoomEncryption)
    ? options.storeEncryptedContent
    : options.storeContent;

export const runLiveTimelineScan = async (
  mx: MatrixClient,
  userId: string,
  mDirects: Set<string>,
  content: ScanContentOptions
): Promise<number> => {
  const notifications: StoredNotification[] = [];
  for (const room of mx.getRooms()) {
    const notificationType = getNotificationType(mx, room.roomId);
    if (room.isSpaceRoom() || notificationType === NotificationType.Mute) continue;

    for (const event of room.getLiveTimeline().getEvents()) {
      const notification = evaluateNotification(mx, room, event, mDirects, notificationType, {
        storeContent: storesContent(room, content),
      });
      if (notification) notifications.push(notification);
    }
    // Keep initial rendering responsive with large accounts.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  getLocalNotificationCache(userId).mergeMany(notifications);
  return notifications.length;
};

const loadDirectRooms = (mx: MatrixClient): Set<string> => {
  const directEvent = getAccountData(mx, EventType.Direct);
  return directEvent ? getMDirects(directEvent) : new Set();
};

export const backfillLocalNotifications = async (
  mx: MatrixClient,
  userId: string,
  content: ScanContentOptions,
  options: BackfillOptions = {}
): Promise<number> => {
  const { includeRead = false, signal, tab = 'all' } = options;
  const cache = getLocalNotificationCache(userId);
  const mDirects = loadDirectRooms(mx);
  const rooms = mx
    .getRooms()
    .flatMap((room) => {
      if (
        room.isSpaceRoom() ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute ||
        (tab === 'dms' && !isDMRoom(room, mDirects))
      ) {
        return [];
      }
      const unread = getUnreadInfo(room, { mDirects });
      const target =
        tab === 'mentions' ? unread.highlight : Math.max(unread.total, unread.highlight);
      return includeRead || target > 0
        ? [
            {
              room,
              target: includeRead ? Number.POSITIVE_INFINITY : target,
              highlight: unread.highlight,
            },
          ]
        : [];
    })
    .toSorted(
      (a, b) =>
        b.highlight - a.highlight ||
        Number(isDMRoom(b.room, mDirects)) - Number(isDMRoom(a.room, mDirects)) ||
        b.room.getLastActiveTimestamp() - a.room.getLastActiveTimestamp()
    );

  const cached = cache.getEntries();
  const cachedIds = new Set(cached.map((entry) => entry.event.event_id));
  const stopWatching: Array<() => void> = [];
  const states = rooms.map(({ room, target }) => {
    const timeline = room.getLiveTimeline();
    const events = timeline.getEvents();
    const existing = cached.filter(
      (entry) => entry.room_id === room.roomId && !isStoredNotificationRead(room, userId, entry)
    ).length;
    return {
      room,
      missing: Math.max(0, target - existing),
      frontier: events[0]?.getTs() ?? room.getLastActiveTimestamp(),
      exhausted: !timeline.getPaginationToken(Direction.Backward),
    };
  });
  let pages = 0;
  let recorded = 0;

  while (pages < MAX_PAGES) {
    if (signal?.aborted) break;
    const state = states
      .filter((item) => item.missing > 0 && !item.exhausted)
      .toSorted((a, b) => b.frontier - a.frontier)[0];
    if (!state) break;
    const { room } = state;
    const notificationType = getNotificationType(mx, room.roomId);
    const timeline = room.getLiveTimeline();
    const previousToken = timeline.getPaginationToken(Direction.Backward);
    // eslint-disable-next-line no-await-in-loop
    await mx.scrollback(room, PAGE_SIZE);
    pages += 1;
    const pending: StoredNotification[] = [];

    for (const event of timeline.getEvents().toReversed()) {
      const eventId = event.getId();
      if (!eventId || cachedIds.has(eventId)) continue;
      cachedIds.add(eventId);
      if (!includeRead && room.hasUserReadEvent(userId, eventId)) {
        state.missing = 0;
        break;
      }
      const evaluate = () =>
        evaluateNotification(mx, room, event, mDirects, notificationType, {
          storeContent: storesContent(room, content),
        });
      const notification = evaluate();
      if (notification) {
        pending.push(notification);
        state.missing -= 1;
        recorded += 1;
      }
      if (isAwaitingDecryption(event)) {
        stopWatching.push(
          watchDecryption(event, () => {
            const decrypted = evaluate();
            if (decrypted) cache.merge(decrypted);
          })
        );
      }
      if (state.missing === 0) break;
    }
    cache.mergeMany(pending);
    const events = timeline.getEvents();
    state.frontier = events[0]?.getTs() ?? 0;
    const nextToken = timeline.getPaginationToken(Direction.Backward);
    state.exhausted = !nextToken || nextToken === previousToken;
  }

  if (includeRead) {
    const unresolved = states.filter((state) => !state.exhausted);
    cache.extendHistoryTo(
      tab,
      unresolved.length > 0 ? Math.max(...unresolved.map((state) => state.frontier)) : 0
    );
  }

  const stop = () => stopWatching.splice(0).forEach((dispose) => dispose());
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
  return recorded;
};
