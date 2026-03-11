/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds';
import { IPusherRequest } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getNotificationState, usePermissionState } from '$hooks/usePermission';
import { useEmailNotifications } from '$hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { pushSubscriptionAtom } from '$state/pushSubscription';
import { mobileOrTablet } from '$utils/user-agent';
import {
  requestBrowserNotificationPermission,
  enablePushNotifications,
  disablePushNotifications,
} from './PushNotifications';
import { DeregisterAllPushersSetting } from './DeregisterPushNotifications';

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Sable',
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title="Email Notification"
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Your account does not have any email attached.
            </Text>
          )}
          {result && result.email && <>Send notification to your email. {`("${result.email}")`}</>}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Unexpected Error!
            </Text>
          )}
          {result === undefined && 'Send notification to your email.'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

function WebPushNotificationSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [usePushNotifications, setPushNotifications] = useSetting(
    settingsAtom,
    'usePushNotifications'
  );
  const pushSubAtom = useAtom(pushSubscriptionAtom);

  const browserPermission = usePermissionState('notifications', getNotificationState());
  useEffect(() => {
    setIsLoading(false);
  }, []);
  const handleRequestPermissionAndEnable = async () => {
    setIsLoading(true);
    try {
      const permissionResult = await requestBrowserNotificationPermission();
      if (permissionResult === 'granted') {
        await enablePushNotifications(mx, clientConfig, pushSubAtom);
        setPushNotifications(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePushSwitchChange = async (wantsPush: boolean) => {
    setIsLoading(true);

    try {
      if (wantsPush) {
        await enablePushNotifications(mx, clientConfig, pushSubAtom);
      } else {
        await disablePushNotifications(mx, clientConfig, pushSubAtom);
      }
      setPushNotifications(wantsPush);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingTile
      title="Background Push Notifications"
      description={
        browserPermission === 'denied' ? (
          <Text as="span" style={{ color: color.Critical.Main }} size="T200">
            Permission blocked. Please allow notifications in your browser settings.
          </Text>
        ) : (
          'Receive notifications when the app is closed or in the background.'
        )
      }
      after={
        isLoading ? (
          <Spinner variant="Secondary" />
        ) : browserPermission === 'prompt' ? (
          <Button size="300" radii="300" onClick={handleRequestPermissionAndEnable}>
            <Text size="B300">Enable</Text>
          </Button>
        ) : browserPermission === 'granted' ? (
          <Switch value={usePushNotifications} onChange={handlePushSwitchChange} />
        ) : null
      }
    />
  );
}

export function SystemNotification() {
  const [showInAppNotifs, setShowInAppNotifs] = useSetting(settingsAtom, 'useInAppNotifications');
  const [showSystemNotifs, setShowSystemNotifs] = useSetting(
    settingsAtom,
    'useSystemNotifications'
  );
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );
  const [showMessageContent, setShowMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInNotifications'
  );
  const [showEncryptedMessageContent, setShowEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [clearNotificationsOnRead, setClearNotificationsOnRead] = useSetting(
    settingsAtom,
    'clearNotificationsOnRead'
  );
  const [showUnreadCounts, setShowUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly, setBadgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts, setShowPingCounts] = useSetting(settingsAtom, 'showPingCounts');

  // Describe what the current badge combo actually does so users aren't left guessing.
  const badgeBehaviourSummary = (): string => {
    if (!showUnreadCounts && !showPingCounts) {
      return 'Badges show a plain dot for any unread activity — no numbers displayed.';
    }
    if (!showUnreadCounts && showPingCounts) {
      return 'Badges show a number only when you are directly mentioned; all other unread activity shows a plain dot.';
    }
    if (showUnreadCounts && badgeCountDMsOnly) {
      return 'Only Direct Message badges show a number count. Rooms and spaces show a plain dot instead.';
    }
    return 'All rooms and DMs show a number count for every unread message.';
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">System & Notifications</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="In-App Notifications"
          description="Show a notification banner inside the app when a message arrives."
          after={<Switch value={showInAppNotifs} onChange={setShowInAppNotifs} />}
        />
      </SequenceCard>
      {mobileOrTablet() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <WebPushNotificationSetting />
        </SequenceCard>
      )}
      {!mobileOrTablet() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="System Notifications"
            description="Show an OS-level notification banner when a message arrives while the app is open."
            after={<Switch value={showSystemNotifs} onChange={setShowSystemNotifs} />}
          />
        </SequenceCard>
      )}
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="In-App Notification Sound"
          description="Play a sound inside the app when a new message arrives."
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Show Message Content"
          description="Include message text in notification bodies."
          after={<Switch value={showMessageContent} onChange={setShowMessageContent} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Show Encrypted Message Content"
          description="Allow message text from encrypted rooms in notification bodies. May not work on some platforms due to technical limitations."
          after={
            <Switch
              value={showEncryptedMessageContent}
              onChange={setShowEncryptedMessageContent}
              disabled={!showMessageContent}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Clear Notifications When Read Elsewhere"
          description="Automatically dismiss notifications on this device when you read messages on another device."
          after={<Switch value={clearNotificationsOnRead} onChange={setClearNotificationsOnRead} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <DeregisterAllPushersSetting />
      </SequenceCard>

      <Text size="L400">Badges</Text>
      <Text size="T300" style={{ opacity: 0.7 }}>
        {badgeBehaviourSummary()}
      </Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Show Message Counts"
          description="Show a number on room, space, and DM badges for every unread message."
          after={
            <Switch variant="Primary" value={showUnreadCounts} onChange={setShowUnreadCounts} />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Direct Messages Only"
          description="Only DM badges display a count. Room and space badges show a plain dot instead."
          after={
            <Switch
              variant="Primary"
              value={badgeCountDMsOnly}
              onChange={setBadgeCountDMsOnly}
              disabled={!showUnreadCounts}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Always Count Mentions"
          description="Show a number on any badge where you were directly mentioned, even if message counts are turned off."
          after={<Switch variant="Primary" value={showPingCounts} onChange={setShowPingCounts} />}
        />
      </SequenceCard>
    </Box>
  );
}
