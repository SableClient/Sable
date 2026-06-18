/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppServiceWorker } from './serviceWorkerBootstrap';

const {
  mockHasServiceWorker,
  mockRegister,
  mockAddEventListener,
  mockReady,
  mockGetRegistration,
  mockPushSessionToSW,
  mockConsumeLaunchContext,
  mockWarn,
} = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn(),
  mockRegister: vi.fn(),
  mockAddEventListener: vi.fn(),
  mockReady: Promise.resolve(undefined),
  mockGetRegistration: vi.fn(),
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
    mockGetRegistration.mockResolvedValue(undefined);
    mockRegister.mockResolvedValue({
      addEventListener: vi.fn(),
      installing: null,
      waiting: null,
    });
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => false),
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://charm.example/#/home',
        origin: 'https://charm.example',
        reload: vi.fn(),
        replace: vi.fn(),
      },
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
        serviceWorker: {
          register: mockRegister,
          getRegistration: mockGetRegistration,
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

    expect(mockRegister).toHaveBeenCalledWith('/dev-sw.js?dev-sw', { type: 'module' });
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
        onLine: true,
        serviceWorker: {
          register: mockRegister,
          getRegistration: mockGetRegistration,
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
        onLine: true,
        serviceWorker: {
          register: mockRegister,
          getRegistration: mockGetRegistration,
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

  it('claims clients before reloading when the update prompt is accepted', async () => {
    mockHasServiceWorker.mockReturnValue(true);
    const installingListeners = new Map<string, EventListener>();
    const registrationListeners = new Map<string, EventListener>();
    const serviceWorkerListeners = new Map<string, EventListener>();
    const waitingWorker = { postMessage: vi.fn() };
    const installingWorker = {
      state: 'installing',
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        installingListeners.set(event, listener);
      }),
    };

    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true),
    });

    mockRegister.mockResolvedValueOnce({
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        registrationListeners.set(event, listener);
      }),
      installing: installingWorker,
      waiting: waitingWorker,
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
        serviceWorker: {
          register: mockRegister,
          getRegistration: mockGetRegistration,
          ready: mockReady,
          controller: { postMessage: vi.fn() },
          addEventListener: vi.fn((event: string, listener: EventListener) => {
            serviceWorkerListeners.set(event, listener);
          }),
          removeEventListener: vi.fn((event: string) => {
            serviceWorkerListeners.delete(event);
          }),
        },
      },
    });

    registerAppServiceWorker();
    await Promise.resolve();
    await Promise.resolve();

    registrationListeners.get('updatefound')?.(new Event('updatefound'));
    installingWorker.state = 'installed';
    installingListeners.get('statechange')?.(new Event('statechange'));

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING_AND_CLAIM' });
    expect(window.location.reload).not.toHaveBeenCalled();

    serviceWorkerListeners.get('controllerchange')?.(new Event('controllerchange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('coalesces focus and pageshow watchdog pings into one in-flight check', async () => {
    mockHasServiceWorker.mockReturnValue(true);
    const windowListeners = new Map<string, EventListener>();
    let visibilityState: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    const postMessage = vi.fn();
    const getRegistration = vi.fn().mockResolvedValue({
      active: { postMessage, scriptURL: 'https://charm.example/sw.js' },
      update: vi.fn(),
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
        serviceWorker: {
          register: mockRegister,
          getRegistration,
          ready: mockReady,
          controller: null,
          addEventListener: mockAddEventListener,
        },
      },
    });
    const addWindowListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject
    ) => {
      if (typeof listener === 'function') {
        windowListeners.set(type, listener);
      }
    }) as typeof window.addEventListener);

    registerAppServiceWorker();
    await Promise.resolve();
    visibilityState = 'visible';

    windowListeners.get('focus')?.(new Event('focus'));
    windowListeners.get('pageshow')?.(new PageTransitionEvent('pageshow', { persisted: true }));
    await Promise.resolve();
    await Promise.resolve();
    addWindowListenerSpy.mockRestore();

    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('skips pageshow watchdog recovery for non-persisted loads', async () => {
    mockHasServiceWorker.mockReturnValue(true);
    const getRegistration = vi.fn().mockResolvedValue({
      active: { postMessage: vi.fn(), scriptURL: 'https://charm.example/sw.js' },
      update: vi.fn(),
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
        serviceWorker: {
          register: mockRegister,
          getRegistration,
          ready: mockReady,
          controller: null,
          addEventListener: mockAddEventListener,
        },
      },
    });

    registerAppServiceWorker();
    await Promise.resolve();
    const baselineCalls = getRegistration.mock.calls.length;

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    await Promise.resolve();

    expect(getRegistration.mock.calls.length).toBe(baselineCalls);
  });
});
