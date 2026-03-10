/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner, config } from 'folds';
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
    const showDMs = badgeCountDMsOnly;
    const showRooms = showUnreadCounts;
    const showPings = showPingCounts;

    if (showDMs && showRooms && showPings) {
      return 'All unread messages—DMs, Rooms, and mentions—show a number count.';
    }
    if (!showDMs && !showRooms && !showPings) {
      return 'Badges show a plain dot for all unread activity—no numbers displayed.';
    }

    if (showDMs && !showRooms && !showPings)
      return 'Only Direct Messages show a number count. Rooms and mentions show a plain dot.';
    if (!showDMs && showRooms && !showPings)
      return 'Only Rooms and spaces show a number count. DMs and mentions show a plain dot.';
    if (!showDMs && !showRooms && showPings)
      return 'Only mentions and keywords show a number count. All other activity shows a plain dot.';

    // Case 4: Exactly two are ON
    if (showDMs && showRooms && !showPings)
      return 'DMs and Rooms show a number count. Mentions show a plain dot.';
    if (showDMs && !showRooms && showPings)
      return 'DMs and mentions show a number count. Rooms and spaces show a plain dot.';
    if (!showDMs && showRooms && showPings)
      return 'Rooms and mentions show a number count. Direct Messages show a plain dot.';

    return ''; // Fallback
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

      <Text size="L400" style={{ paddingTop: config.space.S700 }}>
        Badges
      </Text>
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
          title="Show Room Counts"
          description="Displays a number for unread activity in Rooms and Spaces."
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
          title="Show DM Counts"
          description="Displays a number for unread Direct Messages."
          after={
            <Switch variant="Primary" value={badgeCountDMsOnly} onChange={setBadgeCountDMsOnly} />
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
          title="Show Mention Counts"
          description="Displays a number for mentions and keyword alerts."
          after={<Switch variant="Primary" value={showPingCounts} onChange={setShowPingCounts} />}
        />
      </SequenceCard>
    </Box>
  );
}
