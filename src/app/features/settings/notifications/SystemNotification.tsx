import { type FormEvent, MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  color,
  config,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Switch,
  Text,
} from 'folds';
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
import { unifiedPushEndpointAtom, type UnifiedPushState } from '$state/unifiedPushEndpoint';
import { mobileOrTablet } from '$utils/user-agent';
import { stopPropagation } from '$utils/keyboard';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import {
  requestBrowserNotificationPermission,
  enablePushNotifications,
  disablePushNotifications,
} from './PushNotifications';
import { DeregisterAllPushersSetting } from './DeregisterPushNotifications';
import {
  deriveLegacyPushFlags,
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

export function deriveLegacyPushSync(input: {
  enabled: boolean;
  provider: BackgroundPushKind | null;
}): {
  usePushNotifications: boolean;
  useUnifiedPush: boolean;
} {
  return deriveLegacyPushFlags(input.enabled, input.provider);
}

export function shouldRefreshBackgroundPushTransport(
  previousKind: BackgroundPushKind | null,
  nextKind: BackgroundPushKind | null
): boolean {
  return previousKind !== nextKind;
}

export async function switchBackgroundPushTransport(params: {
  previousKind: BackgroundPushKind | null;
  activate: () => Promise<BackgroundPushKind | null>;
  deactivate: (kind: BackgroundPushKind | null) => Promise<void>;
}): Promise<BackgroundPushKind | null> {
  const { previousKind, activate, deactivate } = params;
  const nextKind = await activate();

  if (!shouldRefreshBackgroundPushTransport(previousKind, nextKind)) {
    return nextKind;
  }

  try {
    await deactivate(previousKind);
  } catch (error) {
    await deactivate(nextKind).catch(() => undefined);
    throw error;
  }

  return nextKind;
}

function getNativePushConfigError(clientConfig: ReturnType<typeof useClientConfig>): string | null {
  if (!clientConfig.pushNotificationDetails?.nativePushAppID) {
    return 'Native push requires pushNotificationDetails.nativePushAppID in config.json.';
  }

  if (!clientConfig.pushNotificationDetails?.pushNotifyUrl) {
    return 'Native push requires pushNotificationDetails.pushNotifyUrl in config.json.';
  }

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
  return next;
}

type SettingMenuOption<T extends string> = {
  value: T;
  label: string;
};

function SettingMenuSelector<T extends string>({
  value,
  options,
  onSelect,
  disabled,
  loading,
}: {
  value: T;
  options: SettingMenuOption<T>[];
  onSelect: (value: T) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (nextValue: T) => {
    setMenuCords(undefined);
    onSelect(nextValue);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={
          loading ? (
            <Spinner variant="Secondary" size="300" />
          ) : (
            <Icon size="300" src={Icons.ChevronBottom} />
          )
        }
        onClick={handleMenu}
        disabled={disabled || loading}
      >
        <Text size="T300">{selectedLabel}</Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {options.map((option) => (
                  <MenuItem
                    key={option.value}
                    size="300"
                    variant="Surface"
                    aria-selected={option.value === value}
                    radii="300"
                    onClick={() => handleSelect(option.value)}
                  >
                    <Box grow="Yes">
                      <Text size="T300">{option.label}</Text>
                    </Box>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
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

function labelUnifiedPushDistributorOption(distributor: string): string {
  const lastSegment = distributor
    .split(/[./]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .at(-1);

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
  const [legacyPushNotifications, setLegacyPushNotifications] = useSetting(
    settingsAtom,
    'usePushNotifications'
  );
  const [legacyUnifiedPush, setLegacyUnifiedPush] = useSetting(settingsAtom, 'useUnifiedPush');
  const pushSubAtom = useAtom(pushSubscriptionAtom);
  const [upEndpoint, setUpEndpoint] = useAtom(unifiedPushEndpointAtom);
  const unifiedPushStateRef = useRef<UnifiedPushState>(upEndpoint);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<string>(
    pushTransportOverride.unifiedPushDistributor ?? ''
  );
  const [availableDistributors, setAvailableDistributors] = useState<string[]>([]);
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
    label: labelUnifiedPushDistributorOption(distributor),
  }));

  useEffect(() => {
    unifiedPushStateRef.current = upEndpoint;
  }, [upEndpoint]);

  useEffect(() => {
    const sync = deriveLegacyPushSync({
      enabled: backgroundPushEnabled,
      provider: backgroundPushEnabled ? (backgroundPushProvider ?? preferredKind) : null,
    });

    if (legacyPushNotifications !== sync.usePushNotifications) {
      setLegacyPushNotifications(sync.usePushNotifications);
    }
    if (legacyUnifiedPush !== sync.useUnifiedPush) {
      setLegacyUnifiedPush(sync.useUnifiedPush);
    }
  }, [
    backgroundPushEnabled,
    backgroundPushProvider,
    preferredKind,
    legacyPushNotifications,
    legacyUnifiedPush,
    setLegacyPushNotifications,
    setLegacyUnifiedPush,
  ]);

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
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runtimePlatform, pushTransportOverride.unifiedPushDistributor, setPushTransportOverride]);

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
  });

  const buildRegisteredUnifiedPushState = (
    registration: {
      endpoint: string;
      instance: string;
      distributor?: string;
      pubKeySet?: {
        pubKey: string;
        auth: string;
      };
    },
    distributorOverride?: string
  ): UnifiedPushState => ({
    endpoint: registration.endpoint,
    instance: registration.instance,
    appId: effectivePushTransport.unifiedPushAppID?.trim() ?? DEFAULT_UNIFIED_PUSH_APP_ID,
    gatewayUrl: effectivePushTransport.unifiedPushGatewayUrl?.trim() ?? undefined,
    status: 'registered',
    distributor: distributorOverride ?? registration.distributor,
    permissionState: 'granted',
    pubKeySet: registration.pubKeySet,
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
      await enablePushNotifications(mx, clientConfig, pushSubAtom);
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

    await enableNativePush(mx, clientConfig);
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
        },
      });
      setUnifiedPushEndpointState(null);
      return;
    }

    await disableNativePush(mx, clientConfig);
  };

  const activateAndroidAutoTransport = async (
    currentKind: BackgroundPushKind | null
  ): Promise<BackgroundPushKind> => {
    const nativeFallback = async (failureReason: string): Promise<BackgroundPushKind> => {
      const configError = getNativePushConfigError(clientConfig);
      if (configError) {
        throw new Error(`${failureReason} Native push fallback is unavailable: ${configError}`);
      }

      if (currentKind === 'native') {
        return 'native';
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
      return activateAndroidAutoTransport(currentKind);
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
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
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
        const nextKind = await switchBackgroundPushTransport({
          previousKind,
          activate: () => activateMode(nextMode, previousKind),
          deactivate: deactivateTransport,
        });
        setBackgroundPushProvider(nextKind);
      } else {
        setBackgroundPushProvider(null);
      }
      setPushTransportMode(nextMode);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
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
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsLoading(false);
    }
  };

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
      {supportedModes.length > 2 && (
        <SettingTile
          title="Transport Mode"
          focusId="background-push-transport-mode"
          description={`Current mode: ${labelTransportMode(
            selectedTransportMode
          )}${effectiveKind ? ` (${labelTransportKind(effectiveKind)})` : ''}`}
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
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="In-App Notifications"
          focusId="in-app-notifications"
          description="Show a notification banner inside the app when a message arrives."
          after={<Switch value={showInAppNotifs} onChange={setShowInAppNotifs} />}
        />
      </SequenceCard>
      {!mobileOrTablet() && (
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
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="In-App Notification Sound"
          focusId="in-app-notification-sound"
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
          focusId="show-message-content"
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
          focusId="show-encrypted-message-content"
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
          focusId="clear-notifications-when-read-elsewhere"
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
          title="Favicon Dot: Mentions Only"
          focusId="favicon-dot-mentions-only"
          description="Only change the browser tab favicon when you have mentions or keywords. Unreads without mentions won't affect the favicon."
          after={
            <Switch
              variant="Primary"
              value={faviconForMentionsOnly}
              onChange={setFaviconForMentionsOnly}
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
          title="Show Room Counts"
          focusId="show-room-counts"
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
          focusId="show-dm-counts"
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
          focusId="show-mention-counts"
          description="Displays a number for mentions and keyword alerts."
          after={<Switch variant="Primary" value={showPingCounts} onChange={setShowPingCounts} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Highlight Mentions"
          focusId="highlight-mentions"
          description="Highlight the full background message when it contains a mention/keyword."
          after={
            <Switch variant="Primary" value={highlightMentions} onChange={setHighlightMentions} />
          }
        />
      </SequenceCard>
    </Box>
  );
}
