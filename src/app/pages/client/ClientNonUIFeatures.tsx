import { useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { lazy, Suspense, type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SetPresence } from '$types/matrix-sdk';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import LogoSVG from '$public/res/svg/logo.svg';
import LogoUnreadSVG from '$public/res/svg/unread.svg';
import LogoHighlightSVG from '$public/res/svg/highlight.svg';
import { setFavicon } from '$utils/dom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { mDirectAtom } from '$state/mDirectList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { registrationAtom } from '$state/serviceWorkerRegistration';
import { pendingNotificationAtom, activeSessionIdAtom } from '$state/sessions';
import { useSlidingSyncActiveRoom } from '$hooks/useSlidingSyncActiveRoom';
import { getSlidingSyncManager } from '$client/initMatrix';
import { useCallSignaling } from '$hooks/useCallSignaling';
import { lastVisitedRoomIdAtom } from '$state/room/lastRoom';
import { useSettingsSyncEffect } from '$hooks/useSettingsSync';
import { getInboxInvitesPath } from '../pathUtils';
import { scheduleDeferredFeatureMount } from './scheduleDeferredFeatureMount';

const DeferredNotificationFeatures = lazy(async () => {
  const mod = await import('./DeferredNotificationFeatures');
  return { default: mod.DeferredNotificationFeatures };
});

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');
  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }
  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');
  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }
  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [faviconForMentionsOnly] = useSetting(settingsAtom, 'faviconForMentionsOnly');
  const registration = useAtomValue(registrationAtom);

  useEffect(() => {
    let notification = false;
    let highlight = false;
    let total = 0;
    let highlightTotal = 0;
    roomToUnread.forEach((unread) => {
      if (unread.from === null) {
        total += unread.total;
        highlightTotal += unread.highlight;
      }
      if (unread.total > 0) notification = true;
      if (unread.highlight > 0) highlight = true;
    });

    if (highlight) setFavicon(LogoHighlightSVG);
    else if (!faviconForMentionsOnly && notification) setFavicon(LogoUnreadSVG);
    else setFavicon(LogoSVG);

    try {
      if (highlightTotal > 0) navigator.setAppBadge(highlightTotal);
      else navigator.clearAppBadge();

      if (usePushNotifications && registration) {
        if (total === 0) {
          registration.getNotifications().then((notifs) => notifs.forEach((n) => n.close()));
        } else {
          registration.getNotifications().then((notifs) => {
            notifs.forEach((n) => {
              const notifRoomId = n.data?.room_id;
              if (!notifRoomId) return;
              const roomUnread = roomToUnread.get(notifRoomId);
              if (!roomUnread || (roomUnread.total === 0 && roomUnread.highlight === 0)) n.close();
            });
          });
        }
      }
    } catch {}
  }, [roomToUnread, usePushNotifications, registration, faviconForMentionsOnly]);

  return null;
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function HandleNotificationClick() {
  const setPending = useSetAtom(pendingNotificationAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const handleMessage = (ev: MessageEvent) => {
      const { data } = ev;
      if (!data || data.type !== 'notificationClick') return;
      const { userId, roomId, eventId, isInvite } = data as {
        userId?: string;
        roomId?: string;
        eventId?: string;
        isInvite?: boolean;
      };
      if (userId) setActiveSessionId(userId);
      if (isInvite) {
        navigate(getInboxInvitesPath());
        return;
      }
      if (!roomId) return;
      setPending({ roomId, eventId, targetSessionId: userId });
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [setPending, setActiveSessionId, navigate]);

  return null;
}

function SyncNotificationSettingsWithServiceWorker() {
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [clearNotificationsOnRead] = useSetting(settingsAtom, 'clearNotificationsOnRead');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const postVisibility = () => {
      const visible = document.visibilityState === 'visible';
      const msg = { type: 'setAppVisible', visible };
      navigator.serviceWorker.controller?.postMessage(msg);
      navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(msg));
    };
    postVisibility();
    document.addEventListener('visibilitychange', postVisibility);
    return () => document.removeEventListener('visibilitychange', postVisibility);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const payload = {
      type: 'setNotificationSettings' as const,
      showMessageContent,
      showEncryptedMessageContent,
      clearNotificationsOnRead,
    };
    navigator.serviceWorker.controller?.postMessage(payload);
    navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(payload));
  }, [showMessageContent, showEncryptedMessageContent, clearNotificationsOnRead]);

  return null;
}

function SlidingSyncActiveRoomSubscriber() {
  useSlidingSyncActiveRoom();
  return null;
}

function SentryRoomContextFeature() {
  const mx = useMatrixClient();
  const mDirect = useAtomValue(mDirectAtom);
  const roomId = useAtomValue(lastVisitedRoomIdAtom);

  useEffect(() => {
    if (!roomId) {
      Sentry.setContext('room', null);
      Sentry.setTag('room_type', 'none');
      Sentry.setTag('room_encrypted', 'none');
      return;
    }
    const room = mx.getRoom(roomId);
    if (!room) return;

    const isDm = mDirect.has(roomId);
    const encrypted = mx.isRoomEncrypted(roomId);
    const memberCount = room.getJoinedMemberCount();
    let memberCountRange: string;
    if (memberCount <= 2) memberCountRange = '1-2';
    else if (memberCount <= 10) memberCountRange = '3-10';
    else if (memberCount <= 50) memberCountRange = '11-50';
    else if (memberCount <= 200) memberCountRange = '51-200';
    else memberCountRange = '200+';

    Sentry.setContext('room', {
      type: isDm ? 'dm' : 'group',
      encrypted,
      member_count_range: memberCountRange,
    });
    Sentry.setTag('room_type', isDm ? 'dm' : 'group');
    Sentry.setTag('room_encrypted', String(encrypted));
  }, [mx, mDirect, roomId]);

  return null;
}

function SentryTagsFeature() {
  const settings = useAtomValue(settingsAtom);

  useEffect(() => {
    Sentry.setTag('message_layout', String(settings.messageLayout));
    Sentry.setTag('message_spacing', settings.messageSpacing);
    Sentry.setTag('twitter_emoji', String(settings.twitterEmoji));
    Sentry.setTag('page_zoom', String(settings.pageZoom));
    if (settings.themeId) Sentry.setTag('theme_id', settings.themeId);
    Sentry.setTag('use_right_bubbles', String(settings.useRightBubbles));
    Sentry.setTag('reduced_motion', String(settings.reducedMotion));
    Sentry.setTag('send_presence', String(settings.sendPresence));
    Sentry.setTag('enter_for_newline', String(settings.enterForNewline));
    Sentry.setTag('media_auto_load', String(settings.mediaAutoLoad));
    Sentry.setTag('url_preview', String(settings.urlPreview));
    Sentry.setTag('use_system_theme', String(settings.useSystemTheme));
    Sentry.setTag('uniform_icons', String(settings.uniformIcons));
    Sentry.setTag('jumbo_emoji_size', settings.jumboEmojiSize);
    Sentry.setTag('caption_position', settings.captionPosition);
    Sentry.setTag('right_swipe_action', settings.rightSwipeAction);
    Sentry.setContext('settings', { ...settings });
  }, [settings]);

  return null;
}

function PresenceFeature() {
  const mx = useMatrixClient();
  const [sendPresence] = useSetting(settingsAtom, 'sendPresence');
  useEffect(() => {
    mx.setSyncPresence(sendPresence ? undefined : SetPresence.Offline);
    getSlidingSyncManager(mx)?.setPresenceEnabled(sendPresence);
  }, [mx, sendPresence]);
  return null;
}

function SettingsSyncFeature() {
  useSettingsSyncEffect();
  return null;
}

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  useCallSignaling();
  const [deferredFeaturesEnabled, setDeferredFeaturesEnabled] = useState(false);
  useEffect(() => scheduleDeferredFeatureMount(() => setDeferredFeaturesEnabled(true)), []);

  return (
    <>
      <SettingsSyncFeature />
      <SystemEmojiFeature />
      <PageZoomFeature />
      <PrivacyBlurFeature />
      <FaviconUpdater />
      <SyncNotificationSettingsWithServiceWorker />
      {deferredFeaturesEnabled && (
        <Suspense fallback={null}>
          <DeferredNotificationFeatures />
        </Suspense>
      )}
      <SlidingSyncActiveRoomSubscriber />
      <PresenceFeature />
      <SentryRoomContextFeature />
      <SentryTagsFeature />
      {children}
    </>
  );
}

function PrivacyBlurFeature() {
  const [blurMedia] = useSetting(settingsAtom, 'privacyBlur');
  const [blurAvatars] = useSetting(settingsAtom, 'privacyBlurAvatars');
  const [blurEmotes] = useSetting(settingsAtom, 'privacyBlurEmotes');

  useEffect(() => {
    document.body.classList.toggle('sable-blur-media', blurMedia);
    document.body.classList.toggle('sable-blur-avatars', blurAvatars);
    document.body.classList.toggle('sable-blur-emotes', blurEmotes);
  }, [blurMedia, blurAvatars, blurEmotes]);

  return null;
}
