import type { ReactNode } from 'react';
import { IconSizesProvider } from '$components/icons/phosphor';
import { ShareTargetFeature } from '$features/share-target/ShareTargetFeature';
import { useIncomingCallSignaling } from '$features/call/useCallSignaling';
import { MatrixRTCSessionProvider } from '$hooks/useMatrixRTCSession';
import { BackgroundNotifications } from './BackgroundNotifications';
import { WebUpdater } from './WebUpdater';
import { NotificationTransportRuntimeFeature } from '$features/settings/notifications/NotificationTransportRuntimeFeature';
import { NotificationRecorder } from './client-non-ui/notificationRecorder';
import {
  InviteNotifications,
  MessageNotifications,
  HandleNotificationClick,
  SyncNotificationSettingsWithServiceWorker,
  HandleDecryptPushEvent,
  NativeNotificationClickRouting,
  NativeNotificationActionRouting,
} from './client-non-ui/notifications';
import { PageTitleUpdater, FaviconUpdater } from './client-non-ui/badging';
import {
  SystemEmojiFeature,
  PageZoomFeature,
  PrivacyBlurFeature,
} from './client-non-ui/appearance';
import {
  HealthMonitor,
  SentryRoomContextFeature,
  SentryTagsFeature,
} from './client-non-ui/telemetry';
import {
  SlidingSyncActiveRoomSubscriber,
  PresenceFeature,
  SettingsSyncFeature,
} from './client-non-ui/sync';
import { GlobalBanners } from './client-non-ui/GlobalBanners';

export { HandleNotificationClick };

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  useIncomingCallSignaling();
  return (
    <MatrixRTCSessionProvider>
      <SettingsSyncFeature />
      <SystemEmojiFeature />
      <PageZoomFeature />
      <PrivacyBlurFeature />
      <FaviconUpdater />
      <PageTitleUpdater />
      <InviteNotifications />
      <MessageNotifications />
      <NotificationRecorder />
      <NativeNotificationClickRouting />
      <NativeNotificationActionRouting />
      <BackgroundNotifications />
      <WebUpdater />
      <NotificationTransportRuntimeFeature />
      <SyncNotificationSettingsWithServiceWorker />
      <HandleDecryptPushEvent />
      <GlobalBanners />
      <SlidingSyncActiveRoomSubscriber />
      <PresenceFeature />
      <SentryRoomContextFeature />
      <SentryTagsFeature />
      <HealthMonitor />
      <ShareTargetFeature />
      <IconSizesProvider>{children}</IconSizesProvider>
    </MatrixRTCSessionProvider>
  );
}
