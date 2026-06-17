/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppServiceWorker } from './serviceWorkerBootstrap';

const {
  mockHasServiceWorker,
  mockRegister,
  mockAddEventListener,
  mockReady,
  mockPushSessionToSW,
  mockConsumeLaunchContext,
  mockWarn,
} = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn(),
  mockRegister: vi.fn(),
  mockAddEventListener: vi.fn(),
  mockReady: Promise.resolve(undefined),
  mockPushSessionToSW: vi.fn(),
  mockConsumeLaunchContext: vi.fn().mockResolvedValue(undefined),
  mockWarn: vi.fn(),
}));

vi.mock('./app/utils/platform', () => ({
  hasServiceWorker: mockHasServiceWorker,
}));

vi.mock('./sw-session', () => ({
  pushSessionToSW: mockPushSessionToSW,
}));

vi.mock('./launch-context-persistence', () => ({
  consumeLaunchContext: mockConsumeLaunchContext,
}));

vi.mock('./app/state/sessions', () => ({
  getFallbackSession: vi.fn(() => undefined),
  MATRIX_SESSIONS_KEY: 'matrix-sessions',
  ACTIVE_SESSION_KEY: 'active-session',
}));

vi.mock('./app/state/utils/atomWithLocalStorage', () => ({
  getLocalStorageItem: vi.fn((_: string, fallback: unknown) => fallback),
}));

vi.mock('./app/utils/debug', () => ({
  createLogger: () => ({
    warn: mockWarn,
  }),
}));

describe('registerAppServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasServiceWorker.mockReturnValue(false);
    mockRegister.mockResolvedValue({
      addEventListener: vi.fn(),
      installing: null,
      waiting: null,
    });
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => false),
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          register: mockRegister,
          ready: mockReady,
          controller: null,
          addEventListener: mockAddEventListener,
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips service worker startup when the platform should not use one', () => {
    registerAppServiceWorker();

    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockAddEventListener).not.toHaveBeenCalled();
    expect(mockPushSessionToSW).not.toHaveBeenCalled();
  });

  it('registers the service worker when the platform supports it', async () => {
    mockHasServiceWorker.mockReturnValue(true);

    registerAppServiceWorker();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockRegister).toHaveBeenCalled();
    expect(mockAddEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('consumes any persisted launch context during bootstrap', async () => {
    mockHasServiceWorker.mockReturnValue(true);

    registerAppServiceWorker();
    await Promise.resolve();

    expect(mockConsumeLaunchContext).toHaveBeenCalledTimes(1);
  });

  it('recovers a fresh notification launch target during bootstrap', async () => {
    mockHasServiceWorker.mockReturnValue(true);
    mockConsumeLaunchContext.mockResolvedValueOnce({
      source: 'notification_click',
      clickedAt: Date.now(),
      targetUrl: 'https://charm.example/#/to/%40alice%3Aexample.org/!room%3Aexample.org',
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://charm.example/#/home',
        origin: 'https://charm.example',
        replace: vi.fn(),
      },
    });

    registerAppServiceWorker();
    await Promise.resolve();

    expect(window.location.replace).toHaveBeenCalledWith(
      '/#/to/%40alice%3Aexample.org/!room%3Aexample.org'
    );
  });

  it('pushes the active session immediately when a controller already exists', () => {
    mockHasServiceWorker.mockReturnValue(true);

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          register: mockRegister,
          ready: mockReady,
          controller: { postMessage: vi.fn() },
          addEventListener: mockAddEventListener,
        },
      },
    });

    registerAppServiceWorker();

    expect(mockPushSessionToSW).toHaveBeenCalledTimes(1);
  });

  it('dispatches the app update event when an updated worker finishes installing', async () => {
    mockHasServiceWorker.mockReturnValue(true);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const installingListeners = new Map<string, EventListener>();
    const registrationListeners = new Map<string, EventListener>();
    const installingWorker = {
      state: 'installing',
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        installingListeners.set(event, listener);
      }),
    };

    mockRegister.mockResolvedValueOnce({
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        registrationListeners.set(event, listener);
      }),
      installing: installingWorker,
      waiting: null,
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          register: mockRegister,
          ready: mockReady,
          controller: { postMessage: vi.fn() },
          addEventListener: mockAddEventListener,
        },
      },
    });

    registerAppServiceWorker();
    await Promise.resolve();
    await Promise.resolve();

    registrationListeners.get('updatefound')?.(new Event('updatefound'));
    installingWorker.state = 'installed';
    installingListeners.get('statechange')?.(new Event('statechange'));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'sable:sw-update' }));
  });
});
