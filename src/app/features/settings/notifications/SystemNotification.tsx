import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getIdentifier } from '@tauri-apps/api/app';
import {
  Box,
  Button,
  color,
  config,
  Icon,
  IconButton,
  Icons,
  Input,
  Spinner,
  Switch,
  Text,
} from 'folds';
import type { IPusherRequest } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile, SettingToggle } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getNotificationState, usePermissionState } from '$hooks/usePermission';
import { useEmailNotifications } from '$hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { pushSubscriptionAtom } from '$state/pushSubscription';
import { unifiedPushEndpointAtom, type UnifiedPushState } from '$state/unifiedPushEndpoint';

import { isMobileOrTablet } from '$utils/platform';
import { isIosTauri } from '$features/settings/notifications/TauriNotificationsApiClient';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import {
  requestBrowserNotificationPermission,
  enablePushNotifications,
  disablePushNotifications,
} from './PushNotifications';
import { DeregisterAllPushersSetting } from './DeregisterPushNotifications';
import {
  disableNativePush,
  enableNativePush,
  getSupportedNotificationTransportModes,
  mergePushConfig,
  normalizeNotificationTransportMode,
  type NotificationTransportMode,
  type NotificationTransportPlatform,
  type NotificationTransportProvider,
  type PushTransportOverrides,
  resolvePreferredNotificationTransportProvider,
} from './NotificationTransport';
import {
  DEFAULT_UNIFIED_PUSH_APP_ID,
  disableUnifiedPush,
  enableUnifiedPush,
  tryEnableUnifiedPush,
  type UnifiedPushTransportConfigInput,
} from './UnifiedPushNotifications';
import { getWebPushServerSupport } from './webPushSupport';
import { deliveryRouteDetail, deliveryRouteSummary, describeDeliveryRoute } from './deliveryRoute';
import { normalizeErrorMessage } from './UnifiedPushTransport';
import {
  ensureUnifiedPushDistributorSelection,
  loadUnifiedPushDistributorState,
  setUnifiedPushDistributorSelection,
  switchUnifiedPushDistributorSelection,
} from './UnifiedPushTransport';

type BackgroundPushKind = NotificationTransportProvider;
type BackgroundPushPlatform = NotificationTransportPlatform;

function getBackgroundPushPlatform(isTauriRuntime: boolean): BackgroundPushPlatform {
  if (!isTauriRuntime) return 'web';

  const platform = osType();
  if (platform === 'android') return 'android';
  if (platform === 'ios') return 'ios';
  return 'desktop';
}

export async function switchBackgroundPushTransport(params: {
  previousKind: BackgroundPushKind | null;
  activate: () => Promise<BackgroundPushKind | null>;
  deactivate: (kind: BackgroundPushKind | null) => Promise<void>;
  reactivate?: (kind: BackgroundPushKind) => Promise<void>;
}): Promise<BackgroundPushKind | null> {
  const { previousKind, activate, deactivate, reactivate } = params;

  if (previousKind) {
    await deactivate(previousKind);
  }

  try {
    return await activate();
  } catch (error) {
    // The old transport is already torn down, so restore it rather than
    // leaving the user with no push delivery.
    if (previousKind && reactivate) {
      await reactivate(previousKind);
    }
    throw error;
  }
}

function getNativePushConfigError(clientConfig: ReturnType<typeof useClientConfig>): string | null {
  if (!clientConfig.pushNotificationDetails?.nativePushAppID) {
    return 'Native push requires pushNotificationDetails.nativePushAppID in config.json.';
  }

  // pushNotifyUrl is intentionally not required here: MSC4174 web push needs no
  // gateway, and legacy paths surface a missing gateway at registration time.

  return null;
}

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
      focusId="email-notification"
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

function labelTransportMode(mode: NotificationTransportMode): string {
  switch (mode) {
    case 'auto':
      return 'Auto';
    case 'unifiedpush':
      return 'UnifiedPush';
    case 'native':
      return 'Native';
    case 'web':
      return 'Web';
    default:
      return mode;
  }
}

function labelTransportKind(kind: BackgroundPushKind): string {
  switch (kind) {
    case 'web':
      return 'Web Push';
    case 'native':
      return 'Native Push';
    case 'unifiedpush':
      return 'UnifiedPush';
    default:
      return kind;
  }
}

function cleanPushTransportOverrides(overrides: PushTransportOverrides): PushTransportOverrides {
  const next: PushTransportOverrides = {};
  if (overrides.unifiedPushGatewayUrl?.trim()) {
    next.unifiedPushGatewayUrl = overrides.unifiedPushGatewayUrl.trim();
  }
  if (overrides.unifiedPushAppID?.trim()) {
    next.unifiedPushAppID = overrides.unifiedPushAppID.trim();
  }
  if (overrides.unifiedPushDistributor?.trim()) {
    next.unifiedPushDistributor = overrides.unifiedPushDistributor.trim();
  }
  if (overrides.unifiedPushEmbeddedServerUrl?.trim()) {
    next.unifiedPushEmbeddedServerUrl = overrides.unifiedPushEmbeddedServerUrl.trim();
  }
  return next;
}

function NotificationTransportOverrideInput({
  focusId,
  title,
  description,
  name,
  value,
  placeholder,
  onSave,
}: {
  focusId: string;
  title: string;
  description: string;
  name: string;
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const hasChanges = draftValue !== value;

  const handleReset = () => {
    setDraftValue(value);
  };

  const handleSubmit = (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    onSave(draftValue);
  };

  return (
    <SettingTile title={title} focusId={focusId} description={description}>
      <Box direction="Column" grow="Yes" gap="100">
        <Box as="form" gap="200" onSubmit={handleSubmit}>
          <Box grow="Yes" direction="Column">
            <Input
              aria-label={title}
              name={name}
              radii="300"
              variant="Secondary"
              value={draftValue}
              placeholder={placeholder}
              onChange={(evt) => setDraftValue(evt.currentTarget.value)}
              style={{ paddingRight: config.space.S200 }}
              after={
                hasChanges && (
                  <IconButton
                    size="300"
                    radii="300"
                    variant="Secondary"
                    type="reset"
                    title={`Reset ${title}`}
                    onClick={handleReset}
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges ? 'Success' : 'Secondary'}
            fill={hasChanges ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges}
            type="submit"
          >
            <Text size="B400">Save</Text>
          </Button>
        </Box>
      </Box>
    </SettingTile>
  );
}

/** The in-app websocket distributor, as the notifications plugin names it. */
const EMBEDDED_WEBSOCKET_DISTRIBUTOR = 'embedded-websocket';

/**
 * `appId` is this app's own package, which the embedded-FCM distributor registers under.
 * It is no longer offered, but a device that already selected it keeps showing it.
 */
export function labelUnifiedPushDistributorOption(distributor: string, appId?: string): string {
  if (distributor === EMBEDDED_WEBSOCKET_DISTRIBUTOR) return 'Built-in';
  if (appId && distributor === appId) return 'Built-in (old, via Google)';

  const lastSegment = distributor
    .split(/[./]/)
    .map((segment) => segment.trim())
    .findLast(Boolean);

  return lastSegment ?? distributor;
}

function BackgroundPushNotificationSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const pushTransportDefaults = {
    unifiedPushGatewayUrl:
      clientConfig.pushTransport?.unifiedPushGatewayUrl ??
      clientConfig.pushNotificationDetails?.unifiedPushGatewayUrl,
    unifiedPushAppID:
      clientConfig.pushTransport?.unifiedPushAppID ??
      clientConfig.pushNotificationDetails?.unifiedPushAppID,
    unifiedPushDistributor: clientConfig.pushTransport?.unifiedPushDistributor,
    unifiedPushEmbeddedServerUrl: clientConfig.pushTransport?.unifiedPushEmbeddedServerUrl,
  };
  const [backgroundPushEnabled, setBackgroundPushEnabled] = useSetting(
    settingsAtom,
    'backgroundPushEnabled'
  );
  const [backgroundPushProvider, setBackgroundPushProvider] = useSetting(
    settingsAtom,
    'backgroundPushProvider'
  );
  const [pushTransportMode, setPushTransportMode] = useSetting(settingsAtom, 'pushTransportMode');
  const [pushTransportOverride, setPushTransportOverride] = useSetting(
    settingsAtom,
    'pushTransportOverride'
  );
  const [useRichPushPayloads] = useSetting(settingsAtom, 'useRichPushPayloads');
  const [pushNotifyUrlOverride, setPushNotifyUrlOverride] = useSetting(
    settingsAtom,
    'pushNotifyUrlOverride'
  );
  const pushSubAtom = useAtom(pushSubscriptionAtom);
  const [upEndpoint, setUpEndpoint] = useAtom(unifiedPushEndpointAtom);
  const unifiedPushStateRef = useRef<UnifiedPushState>(upEndpoint);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<string>(
    pushTransportOverride.unifiedPushDistributor ?? ''
  );
  const [availableDistributors, setAvailableDistributors] = useState<string[]>([]);
  const [distributorScan, setDistributorScan] = useState(0);
  const [serverSendsWebPush, setServerSendsWebPush] = useState(false);
  const [appIdentifier, setAppIdentifier] = useState<string>();
  const browserPermission = usePermissionState('notifications', getNotificationState());
  const isTauriRuntime = isTauri();
  const runtimePlatform = getBackgroundPushPlatform(isTauriRuntime);
  const supportedModes = getSupportedNotificationTransportModes(runtimePlatform);
  const selectedTransportMode = normalizeNotificationTransportMode(
    pushTransportMode,
    runtimePlatform
  );
  const preferredKind = resolvePreferredNotificationTransportProvider(
    selectedTransportMode,
    runtimePlatform
  );
  const effectiveKind = backgroundPushEnabled
    ? (backgroundPushProvider ?? preferredKind)
    : preferredKind;
  const effectivePushTransport = mergePushConfig(pushTransportDefaults, pushTransportOverride);
  const backgroundPushSupported = supportedModes.length > 0;
  const showUnifiedPushSettings =
    runtimePlatform === 'android' &&
    (selectedTransportMode === 'auto' || selectedTransportMode === 'unifiedpush');
  const nativePushConfigError =
    effectiveKind === 'native' ? getNativePushConfigError(clientConfig) : null;
  const modeOptions = supportedModes.map((mode) => ({
    value: mode,
    label: labelTransportMode(mode),
  }));
  const distributorOptions = Array.from(
    new Set(
      [selectedDistributor, ...availableDistributors].filter(
        (distributor): distributor is string => distributor.trim().length > 0
      )
    )
  ).map((distributor) => ({
    value: distributor,
    label: labelUnifiedPushDistributorOption(distributor, appIdentifier),
  }));

  useEffect(() => {
    unifiedPushStateRef.current = upEndpoint;
  }, [upEndpoint]);

  // Read rather than guessed: the app's own package is indistinguishable from any other
  // distributor by name alone.
  useEffect(() => {
    if (!isTauriRuntime) return;
    void getIdentifier()
      .then(setAppIdentifier)
      .catch(() => undefined);
  }, [isTauriRuntime]);

  // The gateway is only consulted when the homeserver cannot push WebPush itself.
  useEffect(() => {
    let cancelled = false;
    getWebPushServerSupport(mx)
      .then((support) => {
        if (!cancelled) setServerSendsWebPush(support.supported);
      })
      .catch(() => {
        if (!cancelled) setServerSendsWebPush(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mx]);

  // Distributors are separate apps, so one can be installed or removed while this screen
  // is open. Re-scan whenever the app comes back to the foreground.
  useEffect(() => {
    if (runtimePlatform !== 'android') return undefined;

    const rescanWhenVisible = () => {
      if (document.visibilityState === 'visible') setDistributorScan((scan) => scan + 1);
    };
    document.addEventListener('visibilitychange', rescanWhenVisible);
    return () => document.removeEventListener('visibilitychange', rescanWhenVisible);
  }, [runtimePlatform]);

  useEffect(() => {
    if (runtimePlatform !== 'android') {
      setAvailableDistributors([]);
      setIsLoading(false);
      return undefined;
    }

    let active = true;
    loadUnifiedPushDistributorState()
      .then((state) => {
        if (!active) return;
        setAvailableDistributors(state.distributors);
        const overrideDistributor = pushTransportOverride.unifiedPushDistributor;
        const nextDistributor = overrideDistributor || state.selectedDistributor;
        if (nextDistributor) {
          setSelectedDistributor(nextDistributor);
          if (!overrideDistributor) {
            setPushTransportOverride((current) =>
              current.unifiedPushDistributor === nextDistributor
                ? current
                : {
                    ...current,
                    unifiedPushDistributor: nextDistributor,
                  }
            );
          }
        }
      })
      .catch((caughtError) => {
        if (!active) return;
        setError(normalizeErrorMessage(caughtError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    runtimePlatform,
    distributorScan,
    pushTransportOverride.unifiedPushDistributor,
    setPushTransportOverride,
  ]);

  const updatePushTransportOverride = (patch: Partial<PushTransportOverrides>) => {
    setPushTransportOverride((current) =>
      cleanPushTransportOverrides({
        ...current,
        ...patch,
      })
    );
  };

  const buildUnifiedPushTransportConfig = (): UnifiedPushTransportConfigInput => ({
    unifiedPushGatewayUrl: effectivePushTransport.unifiedPushGatewayUrl,
    unifiedPushAppID: effectivePushTransport.unifiedPushAppID,
    unifiedPushEmbeddedServerUrl: effectivePushTransport.unifiedPushEmbeddedServerUrl,
    vapidPublicKey: clientConfig.pushNotificationDetails?.vapidPublicKey,
    webPushAppID: clientConfig.pushNotificationDetails?.webPushAppID,
    pushNotifyUrl: clientConfig.pushNotificationDetails?.pushNotifyUrl,
    useRichPushPayloads,
    pushNotifyUrlOverride,
  });

  const buildRegisteredUnifiedPushState = (
    registration: {
      endpoint: string;
      gatewayUrl?: string;
      distributor?: string;
    },
    distributorOverride?: string
  ): UnifiedPushState => ({
    endpoint: registration.endpoint,
    appId: effectivePushTransport.unifiedPushAppID?.trim() ?? DEFAULT_UNIFIED_PUSH_APP_ID,
    gatewayUrl:
      registration.gatewayUrl ?? effectivePushTransport.unifiedPushGatewayUrl?.trim() ?? undefined,
    status: 'registered',
    distributor: distributorOverride ?? registration.distributor,
    permissionState: 'granted',
  });

  const setUnifiedPushEndpointState = (endpoint: UnifiedPushState) => {
    unifiedPushStateRef.current = endpoint;
    setUpEndpoint(endpoint);
  };

  const ensureConfiguredUnifiedPushDistributor = async (): Promise<string> => {
    const distributor = await ensureUnifiedPushDistributorSelection(
      availableDistributors,
      selectedDistributor || effectivePushTransport.unifiedPushDistributor || ''
    );

    if (!distributor) {
      return '';
    }

    setSelectedDistributor(distributor);
    updatePushTransportOverride({ unifiedPushDistributor: distributor });
    return distributor;
  };

  const activateTransport = async (kind: BackgroundPushKind | null) => {
    if (!kind) {
      throw new Error('Background push is not available on this platform.');
    }

    if (kind === 'web') {
      if (browserPermission === 'prompt') {
        const permissionResult = await requestBrowserNotificationPermission();
        if (permissionResult !== 'granted') {
          throw new Error('Browser notification permission was not granted.');
        }
      }
      await enablePushNotifications(mx, clientConfig, pushSubAtom, pushNotifyUrlOverride);
      return;
    }

    if (kind === 'unifiedpush') {
      const distributor = await ensureConfiguredUnifiedPushDistributor();
      if (!distributor) {
        throw new Error('No UnifiedPush distributor selected.');
      }
      const result = await enableUnifiedPush(mx, buildUnifiedPushTransportConfig());
      setUnifiedPushEndpointState(
        buildRegisteredUnifiedPushState(
          {
            ...result,
          },
          distributor
        )
      );
      return;
    }

    if (nativePushConfigError) {
      throw new Error(nativePushConfigError);
    }

    const native = await enableNativePush(mx, clientConfig, pushNotifyUrlOverride);
    setUnifiedPushEndpointState({
      endpoint: native.endpoint ?? native.pushkey,
      appId: clientConfig.pushNotificationDetails?.nativePushAppID ?? '',
      gatewayUrl: native.gatewayUrl,
      status: 'registered',
      permissionState: 'granted',
    });
  };

  const deactivateTransport = async (kind: BackgroundPushKind | null) => {
    if (!kind) return;

    if (kind === 'web') {
      await disablePushNotifications(mx, clientConfig, pushSubAtom);
      return;
    }

    if (kind === 'unifiedpush') {
      const currentUnifiedPushState = unifiedPushStateRef.current;
      await disableUnifiedPush(mx, {
        pushkey: currentUnifiedPushState?.endpoint,
        config: {
          unifiedPushAppID:
            currentUnifiedPushState?.appId ?? effectivePushTransport.unifiedPushAppID,
          webPushAppID: clientConfig.pushNotificationDetails?.webPushAppID,
        },
      });
      setUnifiedPushEndpointState(null);
      return;
    }

    await disableNativePush(mx, clientConfig);
  };

  const activateAndroidAutoTransport = async (): Promise<BackgroundPushKind> => {
    const nativeFallback = async (failureReason: string): Promise<BackgroundPushKind> => {
      const configError = getNativePushConfigError(clientConfig);
      if (configError) {
        throw new Error(`${failureReason} Native push fallback is unavailable: ${configError}`);
      }

      await activateTransport('native');
      return 'native';
    };

    const distributor = await ensureConfiguredUnifiedPushDistributor();
    if (!distributor) {
      return nativeFallback('UnifiedPush is not configured.');
    }

    const result = await tryEnableUnifiedPush(mx, buildUnifiedPushTransportConfig());
    if (result.status === 'registered') {
      setUnifiedPushEndpointState(buildRegisteredUnifiedPushState(result));
      return 'unifiedpush';
    }

    if (result.status === 'temp-unavailable') {
      throw new Error(result.error);
    }

    return nativeFallback(result.error);
  };

  const activateMode = async (
    mode: NotificationTransportMode,
    currentKind: BackgroundPushKind | null
  ): Promise<BackgroundPushKind | null> => {
    const normalizedMode = normalizeNotificationTransportMode(mode, runtimePlatform);
    const nextPreferredKind = resolvePreferredNotificationTransportProvider(
      normalizedMode,
      runtimePlatform
    );

    if (!nextPreferredKind) {
      throw new Error('Selected transport is not available on this platform.');
    }

    if (normalizedMode === 'auto' && runtimePlatform === 'android') {
      if (currentKind === 'unifiedpush') {
        return 'unifiedpush';
      }
      return activateAndroidAutoTransport();
    }

    if (currentKind === nextPreferredKind) {
      return currentKind;
    }

    await activateTransport(nextPreferredKind);
    return nextPreferredKind;
  };

  const handleToggleBackgroundPush = async (wantsPush: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!backgroundPushSupported) {
        throw new Error('Background push is not available in the desktop Tauri build yet.');
      }
      if (wantsPush) {
        const nextKind = await activateMode(selectedTransportMode, null);
        setBackgroundPushProvider(nextKind);
      } else {
        await deactivateTransport(backgroundPushProvider ?? preferredKind);
        setBackgroundPushProvider(null);
      }
      setBackgroundPushEnabled(wantsPush);
    } catch (caughtError) {
      setError(normalizeErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = async (nextMode: NotificationTransportMode) => {
    if (nextMode === selectedTransportMode) return;
    setIsLoading(true);
    setError(null);
    const previousKind = backgroundPushEnabled ? (backgroundPushProvider ?? preferredKind) : null;

    try {
      if (backgroundPushEnabled) {
        const plannedKind = resolvePreferredNotificationTransportProvider(
          normalizeNotificationTransportMode(nextMode, runtimePlatform),
          runtimePlatform
        );
        if (plannedKind !== previousKind) {
          const nextKind = await switchBackgroundPushTransport({
            previousKind,
            activate: () => activateMode(nextMode, previousKind),
            deactivate: deactivateTransport,
            reactivate: activateTransport,
          });
          setBackgroundPushProvider(nextKind);
        }
      } else {
        setBackgroundPushProvider(null);
      }
      setPushTransportMode(nextMode);
    } catch (caughtError) {
      setError(normalizeErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDistributorChange = async (distributor: string) => {
    if (distributor === selectedDistributor) return;
    setIsLoading(true);
    setError(null);
    try {
      const activeKind = backgroundPushEnabled ? (backgroundPushProvider ?? preferredKind) : null;
      if (backgroundPushEnabled && activeKind === 'unifiedpush') {
        const result = await switchUnifiedPushDistributorSelection(
          distributor,
          selectedDistributor,
          () => enableUnifiedPush(mx, buildUnifiedPushTransportConfig())
        );
        setUnifiedPushEndpointState(
          buildRegisteredUnifiedPushState(
            {
              ...result,
            },
            distributor
          )
        );
      } else {
        await setUnifiedPushDistributorSelection(distributor);
      }
      setSelectedDistributor(distributor);
      updatePushTransportOverride({ unifiedPushDistributor: distributor });
    } catch (caughtError) {
      setError(normalizeErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  };

  const deliveryRoute =
    backgroundPushEnabled && effectiveKind
      ? describeDeliveryRoute({
          homeserverUrl: mx.baseUrl,
          serverSendsWebPush,
          gatewayUrl: upEndpoint?.gatewayUrl,
          endpoint: upEndpoint?.endpoint,
          embedded: upEndpoint?.distributor === EMBEDDED_WEBSOCKET_DISTRIBUTOR,
        })
      : undefined;

  const transportDescription = (() => {
    if (error) {
      return (
        <Text as="span" style={{ color: color.Critical.Main }} size="T200">
          {error}
        </Text>
      );
    }

    if (!backgroundPushSupported) {
      return (
        <Text as="span" style={{ color: color.Warning.Main }} size="T200">
          Background push is not available in the desktop Tauri build yet.
        </Text>
      );
    }

    if (!backgroundPushEnabled) {
      return 'Receive notifications when the app is closed or in the background.';
    }

    if (nativePushConfigError) {
      return (
        <Text as="span" style={{ color: color.Warning.Main }} size="T200">
          {nativePushConfigError}
        </Text>
      );
    }

    if (browserPermission === 'denied' && effectiveKind === 'web') {
      return (
        <Text as="span" style={{ color: color.Critical.Main }} size="T200">
          Permission blocked. Please allow notifications in your browser settings.
        </Text>
      );
    }

    if (!effectiveKind) {
      return 'Receive notifications when the app is closed or in the background.';
    }

    return `Background push is using ${labelTransportKind(effectiveKind)}.`;
  })();

  const renderTransportToggle = () => {
    if (isLoading) {
      return <Spinner variant="Secondary" />;
    }

    if (!backgroundPushSupported) {
      return <Switch value={false} disabled />;
    }

    if (!backgroundPushEnabled && nativePushConfigError) {
      return <Switch value={false} disabled />;
    }

    if (!backgroundPushEnabled && effectiveKind === 'web' && browserPermission === 'prompt') {
      return (
        <Button size="300" radii="300" onClick={() => handleToggleBackgroundPush(true)}>
          <Text size="B300">Enable</Text>
        </Button>
      );
    }

    return <Switch value={backgroundPushEnabled} onChange={handleToggleBackgroundPush} />;
  };

  return (
    <>
      <SettingTile
        title="Background Push Notifications"
        focusId="background-push-notifications"
        description={transportDescription}
        after={renderTransportToggle()}
      />
      {deliveryRoute && (
        <SettingTile
          title="Delivery Route"
          focusId="push-delivery-route"
          description={`${deliveryRouteSummary(deliveryRoute)} — ${deliveryRouteDetail(deliveryRoute)}`}
        />
      )}
      {supportedModes.length > 2 && (
        <SettingTile
          title="Transport Mode"
          focusId="background-push-transport-mode"
          description={`Current mode: ${labelTransportMode(selectedTransportMode)}${
            effectiveKind ? ` (${labelTransportKind(effectiveKind)})` : ''
          }`}
          after={
            <SettingMenuSelector
              value={selectedTransportMode}
              options={modeOptions}
              onSelect={handleModeChange}
              loading={isLoading}
            />
          }
        />
      )}
      {showUnifiedPushSettings && (
        <>
          <SettingTile
            title="UnifiedPush Distributor"
            focusId="unified-push-distributor"
            description={selectedDistributor || 'Not selected. Pick a distributor such as ntfy.'}
            after={
              distributorOptions.length > 0 ? (
                <SettingMenuSelector
                  value={selectedDistributor}
                  options={distributorOptions}
                  onSelect={handleDistributorChange}
                  loading={isLoading}
                />
              ) : undefined
            }
          >
            {distributorOptions.length === 0 && (
              <Text size="T300" priority="300">
                No UnifiedPush distributors were detected yet.
              </Text>
            )}
          </SettingTile>
          <NotificationTransportOverrideInput
            focusId="unified-push-gateway-url"
            title="UnifiedPush Gateway URL"
            description={`Default: ${pushTransportDefaults.unifiedPushGatewayUrl ?? 'none'}`}
            name="unifiedPushGatewayUrl"
            value={pushTransportOverride.unifiedPushGatewayUrl ?? ''}
            placeholder={pushTransportDefaults.unifiedPushGatewayUrl ?? 'https://gateway.example'}
            onSave={(nextValue) =>
              updatePushTransportOverride({ unifiedPushGatewayUrl: nextValue })
            }
          />
          <NotificationTransportOverrideInput
            focusId="unified-push-embedded-server-url"
            title="Built-in distributor server"
            description="Endpoint server used when no distributor app is installed and this build has no FCM."
            name="unifiedPushEmbeddedServerUrl"
            value={pushTransportOverride.unifiedPushEmbeddedServerUrl ?? ''}
            placeholder={pushTransportDefaults.unifiedPushEmbeddedServerUrl ?? 'https://ntfy.sh'}
            onSave={(nextValue) =>
              updatePushTransportOverride({ unifiedPushEmbeddedServerUrl: nextValue })
            }
          />
          <NotificationTransportOverrideInput
            focusId="unified-push-app-id"
            title="UnifiedPush App ID"
            description={`Default: ${pushTransportDefaults.unifiedPushAppID ?? 'none'}`}
            name="unifiedPushAppID"
            value={pushTransportOverride.unifiedPushAppID ?? ''}
            placeholder={pushTransportDefaults.unifiedPushAppID ?? 'moe.sable.up'}
            onSave={(nextValue) => updatePushTransportOverride({ unifiedPushAppID: nextValue })}
          />
        </>
      )}
      {backgroundPushSupported && serverSendsWebPush && (
        <SettingTile
          title="Push Gateway"
          focusId="web-push-gateway-url"
          description="Not used: your homeserver sends web push itself (MSC4174)."
        />
      )}
      {backgroundPushSupported && !serverSendsWebPush && (
        <NotificationTransportOverrideInput
          focusId="web-push-gateway-url"
          title="Push Gateway URL"
          description={`Your homeserver does not support MSC4174 web push, so pushes go through this gateway. Default: ${
            clientConfig.pushNotificationDetails?.pushNotifyUrl ?? 'none'
          }`}
          name="pushNotifyUrlOverride"
          value={pushNotifyUrlOverride ?? ''}
          placeholder={
            clientConfig.pushNotificationDetails?.pushNotifyUrl ??
            'https://sygnal.example.org/_matrix/push/v1/notify'
          }
          onSave={(nextValue) => setPushNotifyUrlOverride(nextValue.trim() || undefined)}
        />
      )}
    </>
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
  const [useRichPushPayloads, setUseRichPushPayloads] = useSetting(
    settingsAtom,
    'useRichPushPayloads'
  );
  const [showUnreadCounts, setShowUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly, setBadgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts, setShowPingCounts] = useSetting(settingsAtom, 'showPingCounts');
  const [faviconForMentionsOnly, setFaviconForMentionsOnly] = useSetting(
    settingsAtom,
    'faviconForMentionsOnly'
  );
  const [highlightMentions, setHighlightMentions] = useSetting(settingsAtom, 'highlightMentions');

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
      <SettingToggle
        title="In-App Notifications"
        focusId="in-app-notifications"
        description="Show a notification banner inside the app when a message arrives."
        value={showInAppNotifs}
        onChange={setShowInAppNotifs}
      />
      {(!isMobileOrTablet() || isIosTauri()) && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="System Notifications"
            focusId="system-notifications"
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
        <BackgroundPushNotificationSetting />
      </SequenceCard>
      <SettingToggle
        title="In-App Notification Sound"
        focusId="in-app-notification-sound"
        description="Play a sound inside the app when a new message arrives."
        value={isNotificationSounds}
        onChange={setIsNotificationSounds}
      />
      <SettingToggle
        title="Show Message Content"
        focusId="show-message-content"
        description="Include message text in notification bodies."
        value={showMessageContent}
        onChange={setShowMessageContent}
      />
      <SettingToggle
        title="Show Encrypted Message Content"
        focusId="show-encrypted-message-content"
        description="Allow message text from encrypted rooms in notification bodies. May not work on some platforms due to technical limitations."
        value={showEncryptedMessageContent}
        onChange={setShowEncryptedMessageContent}
        disabled={!showMessageContent}
      />
      <SettingToggle
        title="Rich Push Payloads"
        focusId="rich-push-payloads"
        description="Include message content in push payloads for faster notifications. Your push gateway can see unencrypted message text."
        value={useRichPushPayloads}
        onChange={setUseRichPushPayloads}
      />
      <SettingToggle
        title="Clear Notifications When Read Elsewhere"
        focusId="clear-notifications-when-read-elsewhere"
        description="Automatically dismiss notifications on this device when you read messages on another device."
        value={clearNotificationsOnRead}
        onChange={setClearNotificationsOnRead}
      />
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
      <SettingToggle
        title="Favicon Dot: Mentions Only"
        focusId="favicon-dot-mentions-only"
        description="Only change the browser tab favicon when you have mentions or keywords. Unreads without mentions won't affect the favicon."
        value={faviconForMentionsOnly}
        onChange={setFaviconForMentionsOnly}
      />
      <SettingToggle
        title="Show Room Counts"
        focusId="show-room-counts"
        description="Displays a number for unread activity in Rooms and Spaces."
        value={showUnreadCounts}
        onChange={setShowUnreadCounts}
      />
      <SettingToggle
        title="Show DM Counts"
        focusId="show-dm-counts"
        description="Displays a number for unread Direct Messages."
        value={badgeCountDMsOnly}
        onChange={setBadgeCountDMsOnly}
      />
      <SettingToggle
        title="Show Mention Counts"
        focusId="show-mention-counts"
        description="Displays a number for mentions and keyword alerts."
        value={showPingCounts}
        onChange={setShowPingCounts}
      />
      <SettingToggle
        title="Highlight Mentions"
        focusId="highlight-mentions"
        description="Highlight the full background message when it contains a mention/keyword."
        value={highlightMentions}
        onChange={setHighlightMentions}
      />
    </Box>
  );
}
