import { useEffect, useMemo, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { createLogger } from '$utils/debug';
import { type as osType } from '@tauri-apps/plugin-os';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { enableUnifiedPush, setEncryptedContentAllowed } from './UnifiedPushNotifications';
import { healDormantWebPushPusher } from './webPushActivation';
import { enableNativePush, isNativePushPermissionGranted } from './NativePushNotifications';
import { isUnifiedPushPermissionGranted } from './UnifiedPushTransport';
import {
  NotificationTransportRuntime,
  type NotificationTransportRuntimeContext,
} from './NotificationTransportRuntime';
import {
  type NotificationTransportPlatform,
  type NotificationTransportProvider,
  normalizeNotificationTransportMode,
  resolvePreferredNotificationTransportProvider,
} from './NotificationTransport';

const log = createLogger('NotificationTransportRuntimeFeature');

async function checkPushPermission(
  provider: NotificationTransportProvider | null
): Promise<boolean | null> {
  try {
    if (provider === 'unifiedpush') return await isUnifiedPushPermissionGranted();
    if (provider === 'native') return await isNativePushPermissionGranted();
    return null;
  } catch (error) {
    // An unavailable native plugin must not fail the entire application startup.
    log.warn('Unable to check push notification permission', error);
    return null;
  }
}

function currentPlatform(): NotificationTransportPlatform {
  if (!isTauri()) return 'web';
  const platform = osType();
  if (platform === 'android') return 'android';
  if (platform === 'ios') return 'ios';
  return 'desktop';
}

export function NotificationTransportRuntimeFeature() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const [backgroundPushEnabled, setBackgroundPushEnabled] = useSetting(
    settingsAtom,
    'backgroundPushEnabled'
  );
  const [backgroundPushProvider, setBackgroundPushProvider] = useSetting(
    settingsAtom,
    'backgroundPushProvider'
  );
  const [pushTransportMode] = useSetting(settingsAtom, 'pushTransportMode');
  const [pushTransportOverride] = useSetting(settingsAtom, 'pushTransportOverride');
  const [useInAppNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [isNotificationSounds] = useSetting(settingsAtom, 'isNotificationSounds');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [useRichPushPayloads] = useSetting(settingsAtom, 'useRichPushPayloads');
  const [pushNotifyUrlOverride] = useSetting(settingsAtom, 'pushNotifyUrlOverride');

  // The native cold path posts notifications without us.
  useEffect(() => {
    void setEncryptedContentAllowed(showMessageContent && showEncryptedMessageContent);
  }, [showMessageContent, showEncryptedMessageContent]);

  const runtimeRef = useRef<NotificationTransportRuntime | undefined>(undefined);
  if (!runtimeRef.current) runtimeRef.current = new NotificationTransportRuntime();

  // Read fresh by the listener for each incoming push, so toggling display
  // settings doesn't tear the listener down.
  const contextRef = useRef<NotificationTransportRuntimeContext>({
    mx,
    showMessageContent,
    showEncryptedMessageContent,
    notificationSoundEnabled: isNotificationSounds,
    useInAppNotifications,
  });
  contextRef.current = {
    mx,
    showMessageContent,
    showEncryptedMessageContent,
    notificationSoundEnabled: isNotificationSounds,
    useInAppNotifications,
  };

  const platform = currentPlatform();
  const provider = useMemo(() => {
    if (!backgroundPushEnabled) return null;
    const preferred = resolvePreferredNotificationTransportProvider(
      normalizeNotificationTransportMode(pushTransportMode, platform),
      platform
    );
    return backgroundPushProvider ?? preferred;
  }, [backgroundPushEnabled, backgroundPushProvider, pushTransportMode, platform]);

  useEffect(() => {
    void runtimeRef.current?.sync(provider, () => contextRef.current);
  }, [provider]);

  const upConfigRef = useRef<{
    unifiedPushAppID?: string;
    unifiedPushGatewayUrl?: string;
    vapidPublicKey?: string;
    webPushAppID?: string;
    pushNotifyUrl?: string;
    useRichPushPayloads?: boolean;
    pushNotifyUrlOverride?: string;
  }>({});
  upConfigRef.current = {
    unifiedPushAppID:
      pushTransportOverride?.unifiedPushAppID ??
      clientConfig.pushNotificationDetails?.unifiedPushAppID,
    unifiedPushGatewayUrl:
      pushTransportOverride?.unifiedPushGatewayUrl ??
      clientConfig.pushNotificationDetails?.unifiedPushGatewayUrl,
    vapidPublicKey: clientConfig.pushNotificationDetails?.vapidPublicKey,
    webPushAppID: clientConfig.pushNotificationDetails?.webPushAppID,
    pushNotifyUrl: clientConfig.pushNotificationDetails?.pushNotifyUrl,
    useRichPushPayloads,
    pushNotifyUrlOverride,
  };

  // Keep the pusher current: establish it when UnifiedPush becomes the active
  // transport (so it survives a fresh install/session, not just a manual toggle)
  // and refresh it whenever the distributor rotates the endpoint. Deduped by
  // endpoint so re-registration can't loop.
  const clientConfigRef = useRef(clientConfig);
  clientConfigRef.current = clientConfig;

  const pushNotifyUrlOverrideRef = useRef(pushNotifyUrlOverride);
  pushNotifyUrlOverrideRef.current = pushNotifyUrlOverride;

  const lastEndpointRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mx) return undefined;

    void (async () => {
      const granted = await checkPushPermission(provider);
      if (granted === false) {
        setBackgroundPushEnabled(false);
        setBackgroundPushProvider(null);
        return;
      }

      try {
        if (provider === 'unifiedpush') {
          const result = await enableUnifiedPush(mx, upConfigRef.current);
          lastEndpointRef.current = result.endpoint;

          // An MSC4174 pusher whose validation push arrived while the app was closed
          // stays dormant forever, and the server never resends. Re-register so a fresh
          // one is issued now, with the app running to ack it.
          const appId = upConfigRef.current?.webPushAppID;
          if (appId) {
            const healed = await healDormantWebPushPusher(mx, appId, () =>
              enableUnifiedPush(mx, upConfigRef.current)
            );
            if (healed) log.log('Re-registered a dormant MSC4174 pusher');
          }
        } else if (provider === 'native') {
          const native = await enableNativePush(
            mx,
            clientConfigRef.current,
            pushNotifyUrlOverrideRef.current
          );
          lastEndpointRef.current = native.pushkey;
        }
      } catch (error) {
        log.warn('Pusher registration failed at startup', error);
        if ((await checkPushPermission(provider)) === false) {
          setBackgroundPushEnabled(false);
          setBackgroundPushProvider(null);
        }
      }
    })();

    return () => {};
  }, [
    provider,
    mx,
    useRichPushPayloads,
    pushNotifyUrlOverride,
    setBackgroundPushEnabled,
    setBackgroundPushProvider,
  ]);

  useEffect(
    () => () => {
      void runtimeRef.current?.dispose();
    },
    []
  );

  return null;
}
