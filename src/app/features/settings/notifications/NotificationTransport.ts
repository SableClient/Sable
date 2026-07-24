export type NotificationTransportMode = 'auto' | 'unifiedpush' | 'native' | 'web';

export type NotificationTransportProvider = 'unifiedpush' | 'native' | 'web';

export type NotificationTransportPlatform = 'android' | 'ios' | 'desktop' | 'web';

export type NotificationTransportStatus =
  | 'ready'
  | 'temp-unavailable'
  | 'hard-failed'
  | 'unavailable';

export type PushTransportConfig = {
  mode?: NotificationTransportMode;
  unifiedPushGatewayUrl?: string;
  unifiedPushAppID?: string;
  unifiedPushDistributor?: string;
};

export type PushTransportOverrides = Omit<PushTransportConfig, 'mode'>;

export type PushTransportAvailability = {
  available: boolean;
  status: NotificationTransportStatus;
};

export type ResolveNotificationTransportInput = {
  platform: NotificationTransportPlatform;
  enabled: boolean;
  mode: NotificationTransportMode;
  unifiedPush: PushTransportAvailability;
  nativePush: PushTransportAvailability;
  webPush: PushTransportAvailability;
};

export type ResolvedNotificationTransport = {
  provider: NotificationTransportProvider | null;
  status: NotificationTransportStatus;
  degraded: boolean;
};

export type {
  NativePushNotificationsApi,
  NativePushRegistrationResult,
} from './NativePushNotifications';

export {
  disableNativePush,
  enableNativePush,
  ensureNativePushRegistered,
  ensureNativePushUnregistered,
  isNativePushPermissionGranted,
  requestNativePushPermission,
} from './NativePushNotifications';

export function getSupportedNotificationTransportModes(
  platform: NotificationTransportPlatform
): NotificationTransportMode[] {
  if (platform === 'android') {
    return ['auto', 'unifiedpush', 'native'];
  }

  if (platform === 'ios') {
    return ['auto', 'native'];
  }

  if (platform === 'web') {
    return ['auto', 'web'];
  }

  return [];
}

export function normalizeNotificationTransportMode(
  mode: NotificationTransportMode,
  platform: NotificationTransportPlatform
): NotificationTransportMode {
  const supportedModes = getSupportedNotificationTransportModes(platform);
  if (supportedModes.includes(mode)) return mode;
  return supportedModes[0] ?? 'auto';
}

export function resolvePreferredNotificationTransportProvider(
  mode: NotificationTransportMode,
  platform: NotificationTransportPlatform
): NotificationTransportProvider | null {
  const normalizedMode = normalizeNotificationTransportMode(mode, platform);

  if (platform === 'desktop') return null;

  if (normalizedMode === 'web') return 'web';
  if (normalizedMode === 'native') return 'native';
  if (normalizedMode === 'unifiedpush') return 'unifiedpush';
  if (platform === 'web') return 'web';
  if (platform === 'android') return 'unifiedpush';
  if (platform === 'ios') return 'native';
  return null;
}

export function deriveLegacyPushFlags(
  enabled: boolean,
  provider: NotificationTransportProvider | null
): {
  usePushNotifications: boolean;
  useUnifiedPush: boolean;
} {
  return {
    usePushNotifications: enabled && provider === 'web',
    useUnifiedPush: enabled && provider === 'unifiedpush',
  };
}

export function mergePushConfig(
  defaults: PushTransportConfig,
  overrides: Partial<PushTransportConfig>
): PushTransportConfig {
  return {
    mode: overrides.mode ?? defaults.mode,
    unifiedPushGatewayUrl: overrides.unifiedPushGatewayUrl ?? defaults.unifiedPushGatewayUrl,
    unifiedPushAppID: overrides.unifiedPushAppID ?? defaults.unifiedPushAppID,
    unifiedPushDistributor: overrides.unifiedPushDistributor ?? defaults.unifiedPushDistributor,
  };
}

function resolveProvider(
  availability: PushTransportAvailability,
  provider: ResolvedNotificationTransport['provider']
): ResolvedNotificationTransport {
  if (!availability.available) {
    return {
      provider: null,
      status: 'unavailable',
      degraded: false,
    };
  }

  return {
    provider,
    status: availability.status,
    degraded: availability.status === 'temp-unavailable',
  };
}

export function resolveNotificationTransport(
  input: ResolveNotificationTransportInput
): ResolvedNotificationTransport {
  if (!input.enabled) {
    return { provider: null, status: 'unavailable', degraded: false };
  }

  if (input.mode === 'web') {
    return resolveProvider(input.webPush, 'web');
  }

  if (input.mode === 'native') {
    return resolveProvider(input.nativePush, 'native');
  }

  if (input.mode === 'unifiedpush') {
    return resolveProvider(input.unifiedPush, 'unifiedpush');
  }

  if (input.platform === 'android') {
    if (
      input.unifiedPush.available &&
      (input.unifiedPush.status === 'ready' || input.unifiedPush.status === 'temp-unavailable')
    ) {
      return resolveProvider(input.unifiedPush, 'unifiedpush');
    }

    if (input.unifiedPush.status === 'hard-failed' && input.nativePush.available) {
      return resolveProvider(input.nativePush, 'native');
    }

    return resolveProvider(input.nativePush, 'native');
  }

  if (input.platform === 'ios') {
    return resolveProvider(input.nativePush, 'native');
  }

  if (input.platform === 'web') {
    return resolveProvider(input.webPush, 'web');
  }

  return { provider: null, status: 'unavailable', degraded: false };
}
