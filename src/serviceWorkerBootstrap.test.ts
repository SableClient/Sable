import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppServiceWorker } from './serviceWorkerBootstrap';

const {
  mockHasServiceWorker,
  mockRegister,
  mockAddEventListener,
  mockReady,
  mockPushSessionToSW,
  mockWarn,
} = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn(),
  mockRegister: vi.fn().mockResolvedValue({
    addEventListener: vi.fn(),
    installing: null,
    waiting: null,
  }),
  mockAddEventListener: vi.fn(),
  mockReady: Promise.resolve(undefined),
  mockPushSessionToSW: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('./app/utils/platform', () => ({
  hasServiceWorker: mockHasServiceWorker,
}));

vi.mock('./sw-session', () => ({
  pushSessionToSW: mockPushSessionToSW,
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
});
