/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner, config } from 'folds';
import { IPusherRequest } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import FocusTrap from 'focus-trap-react';
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
import { unifiedPushEndpointAtom } from '$state/unifiedPushEndpoint';
import { mobileOrTablet } from '$utils/user-agent';
import { stopPropagation } from '$utils/keyboard';
import {
  requestBrowserNotificationPermission,
  enablePushNotifications,
  disablePushNotifications,
} from './PushNotifications';
import {
  enableUnifiedPush,
  disableUnifiedPush,
  getUnifiedPushDistributors,
  getUnifiedPushDistributor,
  saveUnifiedPushDistributor,
} from './UnifiedPushNotifications';
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
  const isTauriApp = isTauri();
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

  useEffect(() => {
    if (isTauriApp && usePushNotifications) {
      setPushNotifications(false);
    }
  }, [isTauriApp, usePushNotifications, setPushNotifications]);

  const handleRequestPermissionAndEnable = async () => {
    if (isTauriApp) return;

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
    if (isTauriApp && wantsPush) return;

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
        isTauriApp ? (
          <Text as="span" style={{ color: color.Warning.Main }} size="T200">
            Unavailable in Tauri runtime.
          </Text>
        ) : browserPermission === 'denied' ? (
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
          <Button
            size="300"
            radii="300"
            onClick={handleRequestPermissionAndEnable}
            disabled={isTauriApp}
          >
            <Text size="B300">Enable</Text>
          </Button>
        ) : browserPermission === 'granted' ? (
          <Switch
            value={usePushNotifications}
            onChange={handlePushSwitchChange}
            disabled={isTauriApp && !usePushNotifications}
          />
        ) : null
      }
    />
  );
}

function UnifiedPushNotificationSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const [useUP, setUseUP] = useSetting(settingsAtom, 'useUnifiedPush');
  const [upEndpoint, setUpEndpoint] = useAtom(unifiedPushEndpointAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distributors, setDistributors] = useState<string[]>([]);
  const [currentDistributor, setCurrentDistributor] = useState<string>('');
  const [menuCords, setMenuCords] = useState<RectCords>();

  useEffect(() => {
    Promise.all([
      getUnifiedPushDistributors().catch(() => ({ distributors: [] as string[] })),
      getUnifiedPushDistributor().catch(() => ({ distributor: '' })),
    ]).then(async ([distResult, savedResult]) => {
      setDistributors(distResult.distributors);
      setCurrentDistributor(savedResult.distributor);

      // Auto-save the only available distributor when none is saved yet.
      // UP connector 3.x requires an explicit selection before register() works.
      if (!savedResult.distributor && distResult.distributors.length === 1) {
        await saveUnifiedPushDistributor(distResult.distributors[0]);
        setCurrentDistributor(distResult.distributors[0]);
      }
    });
  }, []);

  const handleToggle = async (wantsUP: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (wantsUP) {
        // Ensure a distributor is saved before registration.
        // UP connector 3.x requires an explicit distributor selection;
        // if none is saved, register() silently does nothing.
        if (!currentDistributor && distributors.length > 0) {
          await saveUnifiedPushDistributor(distributors[0]);
          setCurrentDistributor(distributors[0]);
        }

        const result = await enableUnifiedPush(mx, clientConfig);
        setUpEndpoint(result);
        setUseUP(true);
      } else {
        await disableUnifiedPush(mx, clientConfig, upEndpoint?.endpoint);
        setUpEndpoint(null);
        setUseUP(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('UnifiedPush toggle failed:', e);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDistributor = async (distributor: string) => {
    setMenuCords(undefined);
    if (distributor === currentDistributor) return;
    setIsLoading(true);
    try {
      if (useUP) {
        await disableUnifiedPush(mx, clientConfig, upEndpoint?.endpoint);
      }
      await saveUnifiedPushDistributor(distributor);
      setCurrentDistributor(distributor);
      if (useUP) {
        const result = await enableUnifiedPush(mx, clientConfig);
        setUpEndpoint(result);
      }
    } catch (e) {
      console.error('Distributor switch failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const distributorLabel = (pkg: string) => {
    const parts = pkg.split('.');
    return parts[parts.length - 1] ?? pkg;
  };

  const handleDistributorMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <SettingTile
        title="UnifiedPush Notifications"
        description={
          error ? (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {error}
            </Text>
          ) : distributors.length === 0 ? (
            <Text as="span" style={{ color: color.Warning.Main }} size="T200">
              No UnifiedPush distributor installed. Install one (e.g. ntfy, NextPush) to use this
              feature.
            </Text>
          ) : (
            'Receive background notifications via UnifiedPush without Google Services.'
          )
        }
        after={
          isLoading ? (
            <Spinner variant="Secondary" />
          ) : (
            <Switch value={useUP} onChange={handleToggle} disabled={distributors.length === 0} />
          )
        }
      />
      {distributors.length > 1 && (
        <SettingTile
          title="Distributor"
          description={currentDistributor ? distributorLabel(currentDistributor) : 'Not selected'}
          after={
            <>
              <PopOut
                anchor={menuCords}
                position="Bottom"
                align="End"
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setMenuCords(undefined),
                      clickOutsideDeactivates: true,
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu>
                      {distributors.map((d) => (
                        <MenuItem
                          key={d}
                          radii="300"
                          onClick={() => handleSelectDistributor(d)}
                          aria-pressed={d === currentDistributor}
                        >
                          <Text size="B300">{distributorLabel(d)}</Text>
                        </MenuItem>
                      ))}
                    </Menu>
                  </FocusTrap>
                }
              />
              <Button
                size="300"
                radii="300"
                variant="Secondary"
                fill="Soft"
                onClick={handleDistributorMenu}
              >
                <Text size="B300">Change</Text>
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

export function SystemNotification() {
  const isTauriApp = isTauri();
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
      {mobileOrTablet() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="Mobile In-App Notifications"
            description="Show a notification banner inside the app when a message arrives."
            after={<Switch value={showInAppNotifs} onChange={setShowInAppNotifs} />}
          />
        </SequenceCard>
      )}
      {mobileOrTablet() && !isTauriApp && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <WebPushNotificationSetting />
        </SequenceCard>
      )}
      {isTauriApp && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <UnifiedPushNotificationSetting />
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
