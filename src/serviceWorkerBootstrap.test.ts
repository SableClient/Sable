import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppServiceWorker } from './serviceWorkerBootstrap';

const {
  mockHasServiceWorker,
  mockRegister,
  mockAddEventListener,
  mockReady,
  mockPushSessionToSW,
  mockWaitForSessionTokenRefresh,
  mockGetLocalStorageItem,
  mockWarn,
} = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn<() => boolean>(),
  mockRegister: vi.fn<() => Promise<Partial<ServiceWorkerRegistration>>>().mockResolvedValue({
    addEventListener:
      vi.fn<
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: AddEventListenerOptions | boolean
        ) => void
      >(),
    installing: null,
    waiting: null,
  }),
  mockAddEventListener:
    vi.fn<
      (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) => void
    >(),
  mockReady: Promise.resolve(undefined),
  mockPushSessionToSW: vi.fn<(baseUrl?: string, accessToken?: string, userId?: string) => void>(),
  mockWaitForSessionTokenRefresh: vi.fn<(userId: string) => Promise<void>>(),
  mockGetLocalStorageItem: vi.fn<(key: string, fallback: unknown) => unknown>(),
  mockWarn: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock('./app/utils/platform', () => ({
  hasServiceWorker: mockHasServiceWorker,
  isMobileOrTablet: vi.fn<() => boolean>().mockReturnValue(false),
}));

vi.mock('./sw-session', () => ({
  pushSessionToSW: mockPushSessionToSW,
}));

vi.mock('./client/oidcTokenRefresher', () => ({
  waitForSessionTokenRefresh: mockWaitForSessionTokenRefresh,
}));

vi.mock('./app/state/sessions', () => ({
  getFallbackSession: vi.fn<() => undefined>(() => undefined),
  MATRIX_SESSIONS_KEY: 'matrix-sessions',
  ACTIVE_SESSION_KEY: 'active-session',
}));

vi.mock('./app/state/utils/atomWithLocalStorage', () => ({
  getLocalStorageItem: mockGetLocalStorageItem,
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
    mockWaitForSessionTokenRefresh.mockReset().mockResolvedValue(undefined);
    mockGetLocalStorageItem.mockImplementation((_key, fallback) => fallback);
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn<(message?: string) => boolean>(() => false),
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

  it('pushes the active session immediately when a controller already exists', () => {
    mockHasServiceWorker.mockReturnValue(true);

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          register: mockRegister,
          ready: mockReady,
          controller: {
            postMessage: vi.fn<(message: unknown, transfer?: Transferable[]) => void>(),
          },
          addEventListener: mockAddEventListener,
        },
      },
    });

    registerAppServiceWorker();

    expect(mockPushSessionToSW).toHaveBeenCalledTimes(1);
  });

  it('waits for the active session refresh before replying to a session request', async () => {
    let activeSession: { baseUrl: string; userId: string; accessToken: string } | undefined;
    mockGetLocalStorageItem.mockImplementation((key, fallback) => {
      if (key === 'matrix-sessions') return activeSession ? [activeSession] : [];
      if (key === 'active-session') return activeSession?.userId;
      return fallback;
    });
    mockHasServiceWorker.mockReturnValue(true);
    registerAppServiceWorker();
    await Promise.resolve();
    await Promise.resolve();
    mockPushSessionToSW.mockReset();

    activeSession = {
      baseUrl: 'https://hs.example',
      userId: '@alice:hs.example',
      accessToken: 'new-access',
    };
    let resolveRefresh!: () => void;
    mockWaitForSessionTokenRefresh.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      })
    );
    const listener = mockAddEventListener.mock.calls.find(([type]) => type === 'message')?.[1] as
      | ((event: MessageEvent) => void)
      | undefined;
    listener?.({ data: { type: 'requestSession' } } as MessageEvent);

    expect(mockWaitForSessionTokenRefresh).toHaveBeenCalledWith('@alice:hs.example');
    expect(mockPushSessionToSW).not.toHaveBeenCalled();
    resolveRefresh();
    await vi.waitFor(() =>
      expect(mockPushSessionToSW).toHaveBeenCalledWith(
        'https://hs.example',
        'new-access',
        '@alice:hs.example'
      )
    );
  });
});
