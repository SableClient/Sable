import { useAtomValue } from 'jotai';
import { type as osType } from '@tauri-apps/plugin-os';
import { useEffect } from 'react';
import { setTrayBadge } from '$generated/tauri/commands';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import LogoSVG from '$public/res/svg/logo.svg';
import LogoUnreadSVG from '$public/res/svg/unread.svg';
import LogoHighlightSVG from '$public/res/svg/highlight.svg';
import { setFavicon } from '$utils/dom';
import { isNativeNotificationTauri } from '$features/settings/notifications/TauriNotificationsApiClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { registrationAtom } from '$state/serviceWorkerRegistration';
import type { RoomToUnread } from '$types/matrix/room';

// Sum only leaf rooms (from === null); space entries aggregate their children
// and would double-count.
function getUnreadTotals(roomToUnread: RoomToUnread) {
  let total = 0;
  let highlightTotal = 0;
  let notification = false;
  let highlight = false;
  roomToUnread.forEach((unread) => {
    if (unread.from === null) {
      total += unread.total;
      highlightTotal += unread.highlight;
    }
    if (unread.total > 0) {
      notification = true;
    }
    if (unread.highlight > 0) {
      highlight = true;
    }
  });
  return { total, highlightTotal, notification, highlight };
}

// Updates document.title with the mention (highlight) count. Total unread
// is too noisy for a tab title; the OS app badge already uses the same
// highlightTotal value for consistency.
export function PageTitleUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);

  useEffect(() => {
    const { highlightTotal } = getUnreadTotals(roomToUnread);
    document.title = highlightTotal > 0 ? `(${highlightTotal}) Sable Client` : 'Sable Client';
  }, [roomToUnread]);

  return null;
}

export function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [backgroundPushEnabled] = useSetting(settingsAtom, 'backgroundPushEnabled');
  const [faviconForMentionsOnly] = useSetting(settingsAtom, 'faviconForMentionsOnly');
  const registration = useAtomValue(registrationAtom);

  useEffect(() => {
    const { total, highlightTotal, notification, highlight } = getUnreadTotals(roomToUnread);

    if (highlight) {
      setFavicon(LogoHighlightSVG);
    } else if (!faviconForMentionsOnly && notification) {
      setFavicon(LogoUnreadSVG);
    } else {
      setFavicon(LogoSVG);
    }
    try {
      // Only badge with highlight (mention) counts — total unread is too noisy
      // for an OS-level app badge.
      if (isNativeNotificationTauri()) {
        const badgeCount = highlightTotal > 0 ? highlightTotal : undefined;
        if (osType() === 'linux') {
          // Linux has no taskbar badge; the count goes on the tray icon instead.
          setTrayBadge({ count: badgeCount ?? null }).catch(() => {});
        } else {
          import('@tauri-apps/api/window')
            .then(({ getCurrentWindow }) => getCurrentWindow().setBadgeCount(badgeCount))
            .catch(() => {});
        }
      } else if (highlightTotal > 0) {
        navigator.setAppBadge(highlightTotal);
      } else {
        navigator.clearAppBadge();
      }
      if (backgroundPushEnabled && registration) {
        if (total === 0) {
          // All rooms read — clear every notification.
          registration.getNotifications().then((notifs) => notifs.forEach((n) => n.close()));
        } else {
          // Dismiss notifications for individual rooms that are now fully read.
          registration.getNotifications().then((notifs) => {
            notifs.forEach((n) => {
              const notifRoomId = n.data?.room_id;
              if (!notifRoomId) return;
              const roomUnread = roomToUnread.get(notifRoomId);
              if (!roomUnread || (roomUnread.total === 0 && roomUnread.highlight === 0)) {
                n.close();
              }
            });
          });
        }
      }
    } catch {
      // Likely Firefox/Gecko-based and doesn't support badging API
    }
  }, [roomToUnread, backgroundPushEnabled, registration, faviconForMentionsOnly]);

  return null;
}
