import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveLegacyPushSync,
  SystemNotification,
  shouldRefreshBackgroundPushTransport,
  switchBackgroundPushTransport,
} from './SystemNotification';

const {
  settings,
  mockIsTauri,
  mockOsType,
  mockMobileOrTablet,
  mockUseSetting,
  mockEnablePushNotifications,
  mockDisablePushNotifications,
  mockRequestBrowserNotificationPermission,
  mockEnableUnifiedPush,
  mockTryEnableUnifiedPush,
  mockDisableUnifiedPush,
  mockEnsureNativePushRegistered,
  mockEnsureNativePushUnregistered,
  mockLoadUnifiedPushDistributorState,
  mockEnsureUnifiedPushDistributorSelection,
  mockSwitchUnifiedPushDistributorSelection,
  mockSetUnifiedPushDistributorSelection,
  mockPushSubscriptionAtom,
  mockUnifiedPushEndpointAtom,
  mockPushSubscriptionTuple,
  mockUnifiedPushEndpointTuple,
} = vi.hoisted(() => {
  const baseSettings = {
    useInAppNotifications: true,
    useSystemNotifications: true,
    isNotificationSounds: true,
    showMessageContentInNotifications: false,
    showMessageContentInEncryptedNotifications: false,
    clearNotificationsOnRead: false,
    showUnreadCounts: false,
    badgeCountDMsOnly: true,
    showPingCounts: true,
    faviconForMentionsOnly: false,
    highlightMentions: true,
    backgroundPushEnabled: true,
    backgroundPushProvider: null,
    pushTransportMode: 'auto' as const,
    pushTransportOverride: {},
    usePushNotifications: false,
    useUnifiedPush: false,
  };
  const settingsState = { ...baseSettings };
  const setterCache = new Map<string, ReturnType<typeof vi.fn>>();
  const useSettingMock = vi.fn((_: unknown, key: keyof typeof settingsState) => {
    if (!setterCache.has(key)) {
      setterCache.set(
        key,
        vi.fn((valueOrUpdater: unknown) => {
          const current = settingsState[key];
          settingsState[key] =
            typeof valueOrUpdater === 'function'
              ? (valueOrUpdater as (currentValue: never) => never)(current as never)
              : (valueOrUpdater as never);
        })
      );
    }

    return [settingsState[key], setterCache.get(key)!];
  });

  const pushSubscriptionAtomMock = {};
  const unifiedPushEndpointAtomMock = {};
  const pushSubscriptionTupleMock = [null, vi.fn()] as const;
  const unifiedPushEndpointTupleMock = [null, vi.fn()] as const;

  return {
    settings: settingsState,
    mockIsTauri: vi.fn(),
    mockOsType: vi.fn(),
    mockMobileOrTablet: vi.fn(),
    mockUseSetting: useSettingMock,
    mockEnablePushNotifications: vi.fn(),
    mockDisablePushNotifications: vi.fn(),
    mockRequestBrowserNotificationPermission: vi.fn(),
    mockEnableUnifiedPush: vi.fn(),
    mockTryEnableUnifiedPush: vi.fn(),
    mockDisableUnifiedPush: vi.fn(),
    mockEnsureNativePushRegistered: vi.fn(),
    mockEnsureNativePushUnregistered: vi.fn(),
    mockLoadUnifiedPushDistributorState: vi.fn(),
    mockEnsureUnifiedPushDistributorSelection: vi.fn(),
    mockSwitchUnifiedPushDistributorSelection: vi.fn(),
    mockSetUnifiedPushDistributorSelection: vi.fn(),
    mockPushSubscriptionAtom: pushSubscriptionAtomMock,
    mockUnifiedPushEndpointAtom: unifiedPushEndpointAtomMock,
    mockPushSubscriptionTuple: pushSubscriptionTupleMock,
    mockUnifiedPushEndpointTuple: unifiedPushEndpointTupleMock,
  };
});

vi.mock('folds', async () => {
  const actual = await vi.importActual<typeof import('folds')>('folds');

  return {
    ...actual,
    Switch: ({
      value,
      onChange,
      disabled,
    }: {
      value: boolean;
      onChange: (nextValue: boolean) => void;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        role="switch"
        aria-label="mock-switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
      />
    ),
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mockIsTauri,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: mockOsType,
}));

vi.mock('jotai', () => ({
  useAtom: (atom: unknown) => {
    if (atom === mockPushSubscriptionAtom) return mockPushSubscriptionTuple;
    if (atom === mockUnifiedPushEndpointAtom) return mockUnifiedPushEndpointTuple;
    return [null, vi.fn()];
  },
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: mockUseSetting,
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('$state/pushSubscription', () => ({
  pushSubscriptionAtom: mockPushSubscriptionAtom,
}));

vi.mock('$state/unifiedPushEndpoint', () => ({
  unifiedPushEndpointAtom: mockUnifiedPushEndpointAtom,
}));

vi.mock('$hooks/useEmailNotifications', () => ({
  useEmailNotifications: () => [{ email: 'user@example.com', enabled: false }, vi.fn()],
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    setPusher: vi.fn(),
    getUserId: vi.fn(() => '@user:example.org'),
    getDeviceId: vi.fn(() => 'DEVICE'),
    getDevice: vi.fn().mockResolvedValue({ display_name: 'Device' }),
    getPushers: vi.fn().mockResolvedValue({ pushers: [] }),
    baseUrl: 'https://matrix.example',
    getAccessToken: vi.fn(() => 'token'),
  }),
}));

vi.mock('$hooks/useClientConfig', () => ({
  useClientConfig: () => ({
    pushNotificationDetails: {
      unifiedPushGatewayUrl: 'https://default.example/up',
      unifiedPushAppID: 'moe.sable.up',
      webPushAppID: 'web-app',
      nativePushAppID: 'moe.sable.mobile',
      pushNotifyUrl: 'https://push.example/notify',
      vapidPublicKey: 'PUBLIC_KEY',
    },
    pushTransport: {
      unifiedPushGatewayUrl: 'https://default.example/up',
      unifiedPushAppID: 'moe.sable.up',
    },
  }),
}));

vi.mock('$hooks/usePermission', () => ({
  getNotificationState: () => 'granted',
  usePermissionState: () => 'granted',
}));

vi.mock('$utils/user-agent', () => ({
  mobileOrTablet: mockMobileOrTablet,
}));

vi.mock('./PushNotifications', () => ({
  requestBrowserNotificationPermission: mockRequestBrowserNotificationPermission,
  enablePushNotifications: mockEnablePushNotifications,
  disablePushNotifications: mockDisablePushNotifications,
}));

vi.mock('./UnifiedPushNotifications', () => ({
  enableUnifiedPush: mockEnableUnifiedPush,
  tryEnableUnifiedPush: mockTryEnableUnifiedPush,
  disableUnifiedPush: mockDisableUnifiedPush,
}));

vi.mock('./NotificationTransport', () => ({
  enableNativePush: mockEnsureNativePushRegistered,
  disableNativePush: mockEnsureNativePushUnregistered,
  deriveLegacyPushFlags: (enabled: boolean, provider: string | null) => ({
    usePushNotifications: enabled && provider === 'web',
    useUnifiedPush: enabled && provider === 'unifiedpush',
  }),
  getSupportedNotificationTransportModes: (platform: string) => {
    if (platform === 'android') return ['auto', 'unifiedpush', 'native'];
    if (platform === 'ios') return ['auto', 'native'];
    if (platform === 'web') return ['auto', 'web'];
    return [];
  },
  mergePushConfig: (defaults: Record<string, unknown>, overrides: Record<string, unknown>) => ({
    ...defaults,
    ...overrides,
  }),
  normalizeNotificationTransportMode: (mode: string, platform: string) => {
    if (platform === 'android')
      return ['auto', 'unifiedpush', 'native'].includes(mode) ? mode : 'auto';
    if (platform === 'ios') return ['auto', 'native'].includes(mode) ? mode : 'auto';
    if (platform === 'web') return ['auto', 'web'].includes(mode) ? mode : 'auto';
    return 'auto';
  },
  resolvePreferredNotificationTransportProvider: (mode: string, platform: string) => {
    if (platform === 'desktop') return null;
    if (mode === 'web') return 'web';
    if (mode === 'native') return 'native';
    if (mode === 'unifiedpush') return 'unifiedpush';
    if (platform === 'web') return 'web';
    if (platform === 'android') return 'unifiedpush';
    if (platform === 'ios') return 'native';
    return null;
  },
}));

vi.mock('./UnifiedPushTransport', () => ({
  loadUnifiedPushDistributorState: mockLoadUnifiedPushDistributorState,
  ensureUnifiedPushDistributorSelection: mockEnsureUnifiedPushDistributorSelection,
  switchUnifiedPushDistributorSelection: mockSwitchUnifiedPushDistributorSelection,
  setUnifiedPushDistributorSelection: mockSetUnifiedPushDistributorSelection,
}));

vi.mock('./DeregisterPushNotifications', () => ({
  DeregisterAllPushersSetting: () => <div data-testid="deregister-all-pushers" />,
}));

function renderSystemNotification() {
  render(<SystemNotification />);
}

describe('SystemNotification background push surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(settings, {
      useInAppNotifications: true,
      useSystemNotifications: true,
      isNotificationSounds: true,
      showMessageContentInNotifications: false,
      showMessageContentInEncryptedNotifications: false,
      clearNotificationsOnRead: false,
      showUnreadCounts: false,
      badgeCountDMsOnly: true,
      showPingCounts: true,
      faviconForMentionsOnly: false,
      highlightMentions: true,
      backgroundPushEnabled: true,
      backgroundPushProvider: null,
      pushTransportMode: 'auto',
      pushTransportOverride: {},
      usePushNotifications: false,
      useUnifiedPush: false,
    });

    mockIsTauri.mockReturnValue(true);
    mockOsType.mockReturnValue('android');
    mockMobileOrTablet.mockReturnValue(true);
    mockRequestBrowserNotificationPermission.mockResolvedValue('granted');
    mockEnablePushNotifications.mockResolvedValue(undefined);
    mockDisablePushNotifications.mockResolvedValue(undefined);
    mockEnableUnifiedPush.mockResolvedValue({
      endpoint: 'https://push.example/endpoint',
      instance: 'instance',
    });
    mockTryEnableUnifiedPush.mockResolvedValue({
      status: 'registered',
      endpoint: 'https://push.example/endpoint',
      instance: 'instance',
      distributor: 'org.unifiedpush.distributor.ntfy',
    });
    mockDisableUnifiedPush.mockResolvedValue(undefined);
    mockEnsureNativePushRegistered.mockResolvedValue(undefined);
    mockEnsureNativePushUnregistered.mockResolvedValue(undefined);
    mockLoadUnifiedPushDistributorState.mockResolvedValue({
      distributors: ['org.unifiedpush.distributor.ntfy'],
      selectedDistributor: 'org.unifiedpush.distributor.ntfy',
    });
    mockEnsureUnifiedPushDistributorSelection.mockResolvedValue('org.unifiedpush.distributor.ntfy');
    mockSwitchUnifiedPushDistributorSelection.mockResolvedValue({
      endpoint: 'https://push.example/endpoint',
      instance: 'instance',
    });
    mockSetUnifiedPushDistributorSelection.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps iOS auto on the native legacy path without enabling web push', async () => {
    mockOsType.mockReturnValue('ios');

    renderSystemNotification();

    await waitFor(() => {
      expect(settings.usePushNotifications).toBe(false);
      expect(settings.useUnifiedPush).toBe(false);
    });
  });

  it('keeps Android auto on the UnifiedPush legacy path without enabling web push', async () => {
    mockOsType.mockReturnValue('android');

    renderSystemNotification();

    await waitFor(() => {
      expect(settings.usePushNotifications).toBe(false);
      expect(settings.useUnifiedPush).toBe(true);
    });
  });

  it('keeps legacy flags disabled when the active provider is native', () => {
    expect(
      deriveLegacyPushSync({
        enabled: true,
        provider: 'native',
      })
    ).toEqual({
      usePushNotifications: false,
      useUnifiedPush: false,
    });
  });

  it('does not churn transports when switching to a mode with the same effective kind', async () => {
    expect(shouldRefreshBackgroundPushTransport('unifiedpush', 'unifiedpush')).toBe(false);
    expect(shouldRefreshBackgroundPushTransport('native', 'native')).toBe(false);
    expect(shouldRefreshBackgroundPushTransport('web', 'native')).toBe(true);
  });

  it('rolls back the newly activated transport when deactivating the previous one fails', async () => {
    const activate = vi.fn().mockResolvedValue('native');
    const deactivate = vi
      .fn()
      .mockRejectedValueOnce(new Error('old transport stuck'))
      .mockResolvedValueOnce(undefined);

    await expect(
      switchBackgroundPushTransport({
        previousKind: 'web',
        activate,
        deactivate,
      })
    ).rejects.toThrow('old transport stuck');

    expect(activate).toHaveBeenCalledOnce();
    expect(deactivate).toHaveBeenNthCalledWith(1, 'web');
    expect(deactivate).toHaveBeenNthCalledWith(2, 'native');
  });

  it('renders one background push section in the merged settings surface', async () => {
    renderSystemNotification();

    await waitFor(() => {
      expect(screen.getAllByText('Background Push Notifications')).toHaveLength(1);
    });
    expect(screen.getByText('UnifiedPush Distributor')).toBeInTheDocument();
    expect(screen.getByText('UnifiedPush Gateway URL')).toBeInTheDocument();
    expect(screen.getByText('UnifiedPush App ID')).toBeInTheDocument();
    expect(screen.queryByText('UnifiedPush Notifications')).not.toBeInTheDocument();
  });

  it('renders inline UnifiedPush override inputs with mobile-friendly labels', async () => {
    renderSystemNotification();

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'UnifiedPush Gateway URL' })).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'UnifiedPush App ID' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(2);
  });

  it('only persists UnifiedPush override changes after pressing Save', async () => {
    renderSystemNotification();

    const gatewayInput = await screen.findByRole('textbox', { name: 'UnifiedPush Gateway URL' });

    fireEvent.change(gatewayInput, { target: { value: 'https://ntfy.example/up' } });

    expect(settings.pushTransportOverride).toEqual({
      unifiedPushDistributor: 'org.unifiedpush.distributor.ntfy',
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    expect(settings.pushTransportOverride).toEqual({
      unifiedPushDistributor: 'org.unifiedpush.distributor.ntfy',
      unifiedPushGatewayUrl: 'https://ntfy.example/up',
    });
  });

  it('renders transport mode and distributor with dropdown triggers', async () => {
    renderSystemNotification();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'ntfy' })).toBeInTheDocument();
    expect(screen.queryByText('Always use a UnifiedPush distributor.')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Try UnifiedPush first, then fall back to native push if registration fails.'
      )
    ).not.toBeInTheDocument();
  });

  it('hides UnifiedPush settings on iOS auto mode', async () => {
    mockOsType.mockReturnValue('ios');

    renderSystemNotification();

    await waitFor(() => {
      expect(screen.getAllByText('Background Push Notifications')).toHaveLength(1);
    });
    expect(screen.queryByText('UnifiedPush Distributor')).not.toBeInTheDocument();
    expect(screen.queryByText('UnifiedPush Gateway URL')).not.toBeInTheDocument();
  });

  it('hides transport mode when the platform only has auto and one concrete transport', async () => {
    mockIsTauri.mockReturnValue(false);

    renderSystemNotification();

    await waitFor(() => {
      expect(screen.getAllByText('Background Push Notifications')).toHaveLength(1);
    });
    expect(screen.queryByText('Transport Mode')).not.toBeInTheDocument();
  });

  it('marks desktop tauri background push as unavailable', async () => {
    mockOsType.mockReturnValue('linux');
    mockMobileOrTablet.mockReturnValue(false);

    renderSystemNotification();

    await waitFor(() => {
      expect(
        screen.getByText('Background push is not available in the desktop Tauri build yet.')
      ).toBeInTheDocument();
    });
  });
});
