import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { RoomEvent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getLocalNotificationCache } from '$client/localNotificationCache';
import { backfillLocalNotifications } from '$utils/localNotificationBackfill';
import {
  isStoredNotificationRead,
  sliceNotificationPage,
  type NotificationTab,
  type StoredNotification,
} from '$utils/localNotifications';

export type NotificationQuery = {
  tab: NotificationTab;
  includeRead: boolean;
  limit: number;
};

export type NotificationPage = {
  items: StoredNotification[];
  canLoadOlder: boolean;
};

export const useLocalNotificationTimeline = (query: NotificationQuery) => {
  const mx = useMatrixClient();
  const joinedRooms = useAtomValue(allRoomsAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [storeContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [storeEncryptedContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const allowedRooms = useMemo(() => new Set(joinedRooms), [joinedRooms]);
  const cache = getLocalNotificationCache(mx.getSafeUserId());
  const loadedLimit = useRef(query.limit);
  const [entries, setEntries] = useState(() => cache.getEntries());
  const [historyCutoff, setHistoryCutoff] = useState(() => cache.getHistoryCutoff(query.tab));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<Error>();
  const refresh = useCallback(() => {
    setEntries(cache.getEntries());
    setHistoryCutoff(cache.getHistoryCutoff(query.tab));
  }, [cache, query.tab]);

  useEffect(() => {
    loadedLimit.current = query.limit;
    refresh();
  }, [query, refresh]);

  useEffect(() => {
    refresh();
    const unsubscribe = cache.subscribe(refresh);
    mx.on(RoomEvent.Receipt, refresh);
    return () => {
      unsubscribe();
      mx.off(RoomEvent.Receipt, refresh);
    };
  }, [cache, mx, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void backfillLocalNotifications(
      mx,
      mx.getSafeUserId(),
      {
        storeContent,
        storeEncryptedContent: storeContent && storeEncryptedContent,
      },
      { signal: controller.signal, tab: query.tab }
    ).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    });
    return () => controller.abort();
  }, [mx, query.tab, roomToUnread, storeContent, storeEncryptedContent]);

  const page = useMemo<NotificationPage>(() => {
    const visibleEntries = entries.filter((entry) => allowedRooms.has(entry.room_id));
    const unreadRemaining = new Map<string, number>();
    const unreadIds = new Set<string>();
    for (const entry of visibleEntries) {
      if (query.tab === 'dms' && !entry.isDM) continue;
      if (query.tab === 'mentions' && !entry.highlight) continue;
      const room = mx.getRoom(entry.room_id);
      if (!room || isStoredNotificationRead(room, mx.getSafeUserId(), entry)) continue;
      const remaining =
        unreadRemaining.get(entry.room_id) ??
        (query.tab === 'mentions'
          ? roomToUnread.get(entry.room_id)?.highlight
          : roomToUnread.get(entry.room_id)?.total) ??
        0;
      unreadRemaining.set(entry.room_id, Math.max(0, remaining - 1));
      if (remaining > 0) unreadIds.add(entry.event.event_id);
    }
    const orderedEntries = visibleEntries.filter(
      (entry) =>
        unreadIds.has(entry.event.event_id) ||
        (query.includeRead && historyCutoff !== undefined && entry.ts >= historyCutoff)
    );
    const { page: items, nextToken } = sliceNotificationPage(
      orderedEntries,
      0,
      loadedLimit.current,
      query.tab,
      true,
      () => false
    );
    return {
      items,
      canLoadOlder: query.includeRead || nextToken !== undefined,
    };
  }, [allowedRooms, entries, historyCutoff, mx, query, roomToUnread]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    setError(undefined);
    try {
      if (query.includeRead) {
        await backfillLocalNotifications(
          mx,
          mx.getSafeUserId(),
          {
            storeContent,
            storeEncryptedContent: storeContent && storeEncryptedContent,
          },
          { includeRead: true, tab: query.tab }
        );
      }
      loadedLimit.current += query.limit;
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)));
    } finally {
      setLoadingOlder(false);
    }
  }, [
    loadingOlder,
    mx,
    query.includeRead,
    query.limit,
    query.tab,
    refresh,
    storeContent,
    storeEncryptedContent,
  ]);

  return { page, loadingOlder, error, refresh, loadOlder };
};
