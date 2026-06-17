/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingAppUpdate, checkForAppUpdates } from './appUpdates';

const { mockHasServiceWorker } = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn(),
}));

vi.mock('$utils/platform', () => ({
  hasServiceWorker: mockHasServiceWorker,
}));

type MockServiceWorker = {
  postMessage: ReturnType<typeof vi.fn>;
};

type MockRegistration = {
  waiting: MockServiceWorker | null;
  installing: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  } | null;
  update: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

const createRegistration = (): MockRegistration => ({
  waiting: null,
  installing: null,
  update: vi.fn().mockResolvedValue(undefined),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

describe('appUpdates', () => {
  let mockRegistration: MockRegistration;
  let mockReload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockHasServiceWorker.mockReturnValue(true);
    mockRegistration = createRegistration();
    mockReload = vi.fn();

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
          addEventListener: vi.fn(),
        },
      },
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        reload: mockReload,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports an available update when a waiting service worker already exists', async () => {
    mockRegistration.waiting = { postMessage: vi.fn() };

    await expect(checkForAppUpdates()).resolves.toEqual({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });
    expect(mockRegistration.update).not.toHaveBeenCalled();
  });

  it('reports up to date when no waiting worker appears after an update check', async () => {
    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
    expect(mockRegistration.update).toHaveBeenCalledTimes(1);
  });

  it('applies a waiting update and reloads immediately', async () => {
    const waitingWorker = { postMessage: vi.fn() };
    mockRegistration.waiting = waitingWorker;

    await applyPendingAppUpdate();

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('reports native updater unsupported when service workers are unavailable', async () => {
    mockHasServiceWorker.mockReturnValue(false);

    await expect(checkForAppUpdates()).resolves.toEqual({
      kind: 'native-unsupported',
      message: 'Native binary update checking is not configured in this build.',
      canApply: false,
    });
  });
});
