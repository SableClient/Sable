import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyUnifiedPushFailure,
  ensureUnifiedPushDistributorSelection,
  loadUnifiedPushDistributorState,
  registerUnifiedPushTransport,
  switchUnifiedPushDistributorSelection,
  setUnifiedPushDistributorSelection,
} from './UnifiedPushTransport';

const unifiedPushApi = vi.hoisted(() => ({
  isPermissionGranted: vi.fn<() => Promise<boolean>>(),
  requestPermission: vi.fn<() => Promise<string>>(),
  registerForPushNotifications: vi.fn<
    (
      vapid?: string,
      embeddedGatewayUrl?: string
    ) => Promise<{
      deviceToken: string;
      p256dh?: string;
      auth?: string;
      distributor?: string;
    }>
  >(),
  unregisterForPushNotifications: vi.fn<() => Promise<void>>(),
  listDistributors: vi.fn<() => Promise<string[]>>(),
  setDistributor: vi.fn<(name: string) => Promise<void>>(),
  setToken: vi.fn<(token: string) => Promise<void>>(),
}));

vi.mock('./UnifiedPushTransportApiClient', () => ({
  getUnifiedPushTransportApi: vi
    .fn<() => Promise<typeof unifiedPushApi>>()
    .mockResolvedValue(unifiedPushApi),
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('classifyUnifiedPushFailure', () => {
  it('treats temporary unavailability as a distinct failure', () => {
    expect(
      classifyUnifiedPushFailure(new Error('UnifiedPush registration temporarily unavailable'))
    ).toBe('temp-unavailable');
  });

  it('treats missing distributors as a distinct failure', () => {
    expect(classifyUnifiedPushFailure(new Error('No UnifiedPush distributor installed'))).toBe(
      'missing-distributor'
    );
  });
});

describe('registerUnifiedPushTransport', () => {
  it('requests permission before registering and saves the only available distributor', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(false);
    unifiedPushApi.requestPermission.mockResolvedValue('granted');
    localStorage.removeItem('unifiedpush_distributor');
    unifiedPushApi.listDistributors.mockResolvedValue(['org.unifiedpush.distributor.ntfy']);
    unifiedPushApi.registerForPushNotifications.mockResolvedValue({
      deviceToken: 'https://up.example/endpoint',
    });

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://up.example/endpoint',
      distributor: 'org.unifiedpush.distributor.ntfy',
    });
    expect(unifiedPushApi.requestPermission).toHaveBeenCalledOnce();
    expect(unifiedPushApi.setDistributor).toHaveBeenCalledOnce();
    expect(unifiedPushApi.registerForPushNotifications).toHaveBeenCalledOnce();
  });

  it('returns denied without registering when permission is denied', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(false);
    unifiedPushApi.requestPermission.mockResolvedValue('denied');

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'denied',
      permissionState: 'denied',
      error: 'UnifiedPush permission denied',
    });
    expect(unifiedPushApi.registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('registers through the built-in distributor when none is installed', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    localStorage.removeItem('unifiedpush_distributor');
    unifiedPushApi.listDistributors.mockResolvedValue([]);
    unifiedPushApi.registerForPushNotifications.mockResolvedValue({
      deviceToken: 'https://ntfy.sh/upabc123',
      distributor: 'embedded-websocket',
    });

    await expect(registerUnifiedPushTransport(undefined, 'https://ntfy.sh')).resolves.toEqual({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://ntfy.sh/upabc123',
      distributor: 'embedded-websocket',
      p256dh: undefined,
      auth: undefined,
    });
    expect(unifiedPushApi.registerForPushNotifications).toHaveBeenCalledWith(
      undefined,
      'https://ntfy.sh',
      undefined
    );
  });

  it('still reports missing-distributor when no built-in server is configured', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    localStorage.removeItem('unifiedpush_distributor');
    unifiedPushApi.listDistributors.mockResolvedValue([]);

    await expect(registerUnifiedPushTransport(undefined, '   ')).resolves.toMatchObject({
      status: 'missing-distributor',
    });
    expect(unifiedPushApi.registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('returns missing-distributor without registering when none are available', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    localStorage.removeItem('unifiedpush_distributor');
    unifiedPushApi.listDistributors.mockResolvedValue([]);

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'missing-distributor',
      permissionState: 'granted',
      distributors: [],
      error: 'No UnifiedPush distributor installed',
    });
    expect(unifiedPushApi.registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('classifies temporary-unavailable registration failures distinctly', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    localStorage.setItem('unifiedpush_distributor', 'org.example.up');
    unifiedPushApi.listDistributors.mockResolvedValue(['org.example.up']);
    unifiedPushApi.registerForPushNotifications.mockRejectedValue(
      new Error('UnifiedPush registration temporarily unavailable')
    );

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'temp-unavailable',
      permissionState: 'granted',
      distributor: 'org.example.up',
      error: 'UnifiedPush registration temporarily unavailable',
    });
  });

  it('treats missing endpoint data as a hard failure', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    localStorage.setItem('unifiedpush_distributor', 'org.example.up');
    unifiedPushApi.listDistributors.mockResolvedValue(['org.example.up']);
    unifiedPushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: '' });

    await expect(registerUnifiedPushTransport()).resolves.toMatchObject({
      status: 'hard-failure',
      error: 'UnifiedPush registration returned an invalid endpoint',
      distributor: 'org.example.up',
    });
  });

  it('treats a blank-only endpoint as a hard failure', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    localStorage.setItem('unifiedpush_distributor', 'org.example.up');
    unifiedPushApi.listDistributors.mockResolvedValue(['org.example.up']);
    unifiedPushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: '   ' });

    await expect(registerUnifiedPushTransport()).resolves.toMatchObject({
      status: 'hard-failure',
      error: 'UnifiedPush registration returned an invalid endpoint',
      distributor: 'org.example.up',
    });
  });
});

describe('UnifiedPush distributor state helpers', () => {
  it('loads distributor state and auto-saves the sole available distributor', async () => {
    localStorage.removeItem('unifiedpush_distributor');
    unifiedPushApi.listDistributors.mockResolvedValue(['org.unifiedpush.distributor.ntfy']);

    await expect(loadUnifiedPushDistributorState()).resolves.toEqual({
      distributors: ['org.unifiedpush.distributor.ntfy'],
      selectedDistributor: 'org.unifiedpush.distributor.ntfy',
    });
    expect(unifiedPushApi.setDistributor).toHaveBeenCalledOnce();
  });

  it('drops a stale saved distributor that is no longer installed', async () => {
    localStorage.setItem('unifiedpush_distributor', 'org.unifiedpush.distributor.removed');
    unifiedPushApi.listDistributors.mockResolvedValue(['org.unifiedpush.distributor.ntfy']);

    await expect(loadUnifiedPushDistributorState()).resolves.toEqual({
      distributors: ['org.unifiedpush.distributor.ntfy'],
      selectedDistributor: 'org.unifiedpush.distributor.ntfy',
    });
    expect(unifiedPushApi.setDistributor).toHaveBeenCalledWith('org.unifiedpush.distributor.ntfy');
  });

  it('ensures a distributor selection by auto-saving the first available distributor', async () => {
    unifiedPushApi.setDistributor.mockResolvedValue(undefined);
    await expect(
      ensureUnifiedPushDistributorSelection(
        ['org.unifiedpush.distributor.ntfy', 'org.unifiedpush.distributor.nextpush'],
        ''
      )
    ).resolves.toBe('org.unifiedpush.distributor.ntfy');
    expect(unifiedPushApi.setDistributor).toHaveBeenCalledOnce();
  });

  it('replaces a stale selected distributor with the first available one', async () => {
    unifiedPushApi.setDistributor.mockResolvedValue(undefined);
    await expect(
      ensureUnifiedPushDistributorSelection(
        ['org.unifiedpush.distributor.ntfy', 'org.unifiedpush.distributor.nextpush'],
        'org.unifiedpush.distributor.removed'
      )
    ).resolves.toBe('org.unifiedpush.distributor.ntfy');
    expect(unifiedPushApi.setDistributor).toHaveBeenCalledWith('org.unifiedpush.distributor.ntfy');
  });

  it('persists a selected distributor through the transport helper', async () => {
    unifiedPushApi.setDistributor.mockResolvedValue(undefined);
    await expect(
      setUnifiedPushDistributorSelection('org.unifiedpush.distributor.nextpush')
    ).resolves.toBeUndefined();
    expect(unifiedPushApi.setDistributor).toHaveBeenCalledWith(
      'org.unifiedpush.distributor.nextpush'
    );
  });

  it('returns empty distributors when the backend is unavailable', async () => {
    localStorage.removeItem('unifiedpush_distributor');
    unifiedPushApi.listDistributors.mockRejectedValue(new Error('backend unavailable'));

    const result = await loadUnifiedPushDistributorState();
    expect(result.distributors).toEqual([]);
    expect(result.selectedDistributor).toBe('');
  });

  it('restores the previous distributor when a switch registration fails', async () => {
    unifiedPushApi.setDistributor.mockResolvedValue(undefined);
    const register = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('registration failed'));

    await expect(
      switchUnifiedPushDistributorSelection(
        'org.unifiedpush.distributor.ntfy',
        'org.unifiedpush.distributor.nextpush',
        register
      )
    ).rejects.toThrow('registration failed');

    expect(unifiedPushApi.setDistributor).toHaveBeenNthCalledWith(
      1,
      'org.unifiedpush.distributor.ntfy'
    );
    expect(unifiedPushApi.setDistributor).toHaveBeenNthCalledWith(
      2,
      'org.unifiedpush.distributor.nextpush'
    );
    expect(register).toHaveBeenCalledOnce();
  });
});
