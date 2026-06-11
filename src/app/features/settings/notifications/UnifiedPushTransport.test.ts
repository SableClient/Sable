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
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  registerForUnifiedPush: vi.fn(),
  unregisterFromUnifiedPush: vi.fn(),
  getUnifiedPushDistributors: vi.fn(),
  getUnifiedPushDistributor: vi.fn(),
  saveUnifiedPushDistributor: vi.fn(),
}));

vi.mock('./UnifiedPushTransportApiClient', () => ({
  getUnifiedPushTransportApi: vi.fn().mockResolvedValue(unifiedPushApi),
}));

afterEach(() => {
  vi.clearAllMocks();
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
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({ distributor: '' });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({
      distributors: ['org.unifiedpush.distributor.ntfy'],
    });
    unifiedPushApi.registerForUnifiedPush.mockResolvedValue({
      endpoint: 'https://up.example/endpoint',
      instance: 'instance-1',
    });

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://up.example/endpoint',
      instance: 'instance-1',
      distributor: 'org.unifiedpush.distributor.ntfy',
    });
    expect(unifiedPushApi.requestPermission).toHaveBeenCalledOnce();
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenCalledOnce();
    expect(unifiedPushApi.registerForUnifiedPush).toHaveBeenCalledOnce();
  });

  it('returns denied without registering when permission is denied', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(false);
    unifiedPushApi.requestPermission.mockResolvedValue('denied');

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'denied',
      permissionState: 'denied',
      error: 'UnifiedPush permission denied',
    });
    expect(unifiedPushApi.registerForUnifiedPush).not.toHaveBeenCalled();
  });

  it('returns missing-distributor without registering when none are available', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({ distributor: '' });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({ distributors: [] });

    await expect(registerUnifiedPushTransport()).resolves.toEqual({
      status: 'missing-distributor',
      permissionState: 'granted',
      distributors: [],
      error: 'No UnifiedPush distributor installed',
    });
    expect(unifiedPushApi.registerForUnifiedPush).not.toHaveBeenCalled();
  });

  it('classifies temporary-unavailable registration failures distinctly', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({ distributor: 'org.example.up' });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({
      distributors: ['org.example.up'],
    });
    unifiedPushApi.registerForUnifiedPush.mockRejectedValue(
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
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({ distributor: 'org.example.up' });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({
      distributors: ['org.example.up'],
    });
    unifiedPushApi.registerForUnifiedPush.mockResolvedValue({
      endpoint: '',
      instance: 'instance-1',
    });

    await expect(registerUnifiedPushTransport()).resolves.toMatchObject({
      status: 'hard-failure',
      error: 'UnifiedPush registration returned an invalid endpoint',
      distributor: 'org.example.up',
    });
  });

  it('treats missing instance data as a hard failure', async () => {
    unifiedPushApi.isPermissionGranted.mockResolvedValue(true);
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({ distributor: 'org.example.up' });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({
      distributors: ['org.example.up'],
    });
    unifiedPushApi.registerForUnifiedPush.mockResolvedValue({
      endpoint: 'https://up.example/endpoint',
      instance: '',
    });

    await expect(registerUnifiedPushTransport()).resolves.toMatchObject({
      status: 'hard-failure',
      error: 'UnifiedPush registration returned an invalid instance',
      distributor: 'org.example.up',
    });
  });
});

describe('UnifiedPush distributor state helpers', () => {
  it('loads distributor state and auto-saves the sole available distributor', async () => {
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({ distributor: '' });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({
      distributors: ['org.unifiedpush.distributor.ntfy'],
    });

    await expect(loadUnifiedPushDistributorState()).resolves.toEqual({
      distributors: ['org.unifiedpush.distributor.ntfy'],
      selectedDistributor: 'org.unifiedpush.distributor.ntfy',
    });
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenCalledOnce();
  });

  it('drops a stale saved distributor that is no longer installed', async () => {
    unifiedPushApi.getUnifiedPushDistributor.mockResolvedValue({
      distributor: 'org.unifiedpush.distributor.removed',
    });
    unifiedPushApi.getUnifiedPushDistributors.mockResolvedValue({
      distributors: ['org.unifiedpush.distributor.ntfy'],
    });

    await expect(loadUnifiedPushDistributorState()).resolves.toEqual({
      distributors: ['org.unifiedpush.distributor.ntfy'],
      selectedDistributor: 'org.unifiedpush.distributor.ntfy',
    });
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenCalledWith(
      'org.unifiedpush.distributor.ntfy'
    );
  });

  it('ensures a distributor selection by auto-saving the first available distributor', async () => {
    await expect(
      ensureUnifiedPushDistributorSelection(
        ['org.unifiedpush.distributor.ntfy', 'org.unifiedpush.distributor.nextpush'],
        ''
      )
    ).resolves.toBe('org.unifiedpush.distributor.ntfy');
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenCalledOnce();
  });

  it('replaces a stale selected distributor with the first available one', async () => {
    await expect(
      ensureUnifiedPushDistributorSelection(
        ['org.unifiedpush.distributor.ntfy', 'org.unifiedpush.distributor.nextpush'],
        'org.unifiedpush.distributor.removed'
      )
    ).resolves.toBe('org.unifiedpush.distributor.ntfy');
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenCalledWith(
      'org.unifiedpush.distributor.ntfy'
    );
  });

  it('persists a selected distributor through the transport helper', async () => {
    await expect(
      setUnifiedPushDistributorSelection('org.unifiedpush.distributor.nextpush')
    ).resolves.toBeUndefined();
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenCalledWith(
      'org.unifiedpush.distributor.nextpush'
    );
  });

  it('surfaces backend errors while loading distributor state', async () => {
    unifiedPushApi.getUnifiedPushDistributor.mockRejectedValue(new Error('backend unavailable'));
    unifiedPushApi.getUnifiedPushDistributors.mockRejectedValue(new Error('backend unavailable'));

    await expect(loadUnifiedPushDistributorState()).rejects.toThrow('backend unavailable');
  });

  it('restores the previous distributor when a switch registration fails', async () => {
    unifiedPushApi.saveUnifiedPushDistributor.mockResolvedValue(undefined);
    const register = vi.fn().mockRejectedValue(new Error('registration failed'));

    await expect(
      switchUnifiedPushDistributorSelection(
        'org.unifiedpush.distributor.ntfy',
        'org.unifiedpush.distributor.nextpush',
        register
      )
    ).rejects.toThrow('registration failed');

    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenNthCalledWith(
      1,
      'org.unifiedpush.distributor.ntfy'
    );
    expect(unifiedPushApi.saveUnifiedPushDistributor).toHaveBeenNthCalledWith(
      2,
      'org.unifiedpush.distributor.nextpush'
    );
    expect(register).toHaveBeenCalledOnce();
  });
});
