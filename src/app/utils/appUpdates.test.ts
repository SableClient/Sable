/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingAppUpdate, checkForAppUpdates } from './appUpdates';

const { mockHasServiceWorker } = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn(),
}));

const { mockReloadWithTelemetry } = vi.hoisted(() => ({
  mockReloadWithTelemetry: vi.fn<(reason: string) => void>(),
}));

vi.mock('$utils/platform', () => ({
  hasServiceWorker: mockHasServiceWorker,
}));

vi.mock('$utils/reloadWithTelemetry', () => ({
  reloadWithTelemetry: mockReloadWithTelemetry,
}));

type MockServiceWorker = {
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener?: ReturnType<typeof vi.fn>;
  removeEventListener?: ReturnType<typeof vi.fn>;
};

type MockRegistration = {
  waiting: MockServiceWorker | null;
  active?: MockServiceWorker | null;
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
  let serviceWorkerAddEventListener: ReturnType<typeof vi.fn>;
  let serviceWorkerRemoveEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockHasServiceWorker.mockReturnValue(true);
    mockReloadWithTelemetry.mockReset();
    mockRegistration = createRegistration();
    mockReload = vi.fn();
    serviceWorkerAddEventListener = vi.fn();
    serviceWorkerRemoveEventListener = vi.fn();

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
          addEventListener: serviceWorkerAddEventListener,
          removeEventListener: serviceWorkerRemoveEventListener,
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

  it('reports an available update when a new worker is active but not yet controlling the page', async () => {
    const activeWorker = { postMessage: vi.fn() };
    const controllerWorker = { postMessage: vi.fn() };
    mockRegistration.waiting = null;

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: controllerWorker,
          getRegistration: vi.fn().mockResolvedValue({
            ...mockRegistration,
            active: activeWorker,
          }),
          ready: Promise.resolve({
            ...mockRegistration,
            active: activeWorker,
          }),
          addEventListener: vi.fn(),
        },
      },
    });

    await expect(checkForAppUpdates()).resolves.toEqual({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });
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

  it('surfaces a friendly error when the service worker update check fails', async () => {
    mockRegistration.update.mockRejectedValueOnce(new SyntaxError('import.meta is only valid'));

    await expect(checkForAppUpdates()).rejects.toThrow(
      'Failed to check for updates. Reload the app and try again.'
    );
  });

  it('treats an activating worker as an available update even without a waiting worker', async () => {
    const installingWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const activeWorker = { postMessage: vi.fn() };
    const controllerWorker = { postMessage: vi.fn() };
    let updateFoundListener: EventListener | undefined;
    let stateChangeListener: EventListener | undefined;

    mockRegistration = {
      ...createRegistration(),
      installing: installingWorker,
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        if (event === 'updatefound') {
          updateFoundListener = listener;
        }
      }),
    };
    installingWorker.addEventListener.mockImplementation(
      (event: string, listener: EventListener) => {
        if (event === 'statechange') {
          stateChangeListener = listener;
        }
      }
    );

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: controllerWorker,
          getRegistration: vi.fn().mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
          addEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();

    updateFoundListener?.(new Event('updatefound'));
    Object.assign(mockRegistration, { active: activeWorker, waiting: null });
    stateChangeListener?.(new Event('statechange'));

    await expect(resultPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });
  });

  it('waits for controllerchange before reloading a waiting update', async () => {
    const waitingWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    let controllerChangeListener: EventListener | undefined;
    mockRegistration.waiting = waitingWorker;
    serviceWorkerAddEventListener.mockImplementation((event: string, listener: EventListener) => {
      if (event === 'controllerchange') {
        controllerChangeListener = listener;
      }
    });

    const applyPromise = applyPendingAppUpdate();
    await vi.advanceTimersByTimeAsync(0);

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING_AND_CLAIM' });
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();

    controllerChangeListener?.(new Event('controllerchange'));
    await applyPromise;
    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('retries client claiming from the page when a new worker activates but takeover stalls', async () => {
    const waitingWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const activeWorker = { postMessage: vi.fn() };
    let waitingStateChangeListener: EventListener | undefined;
    let controllerChangeListener: EventListener | undefined;
    mockRegistration.waiting = waitingWorker;
    waitingWorker.addEventListener.mockImplementation((event: string, listener: EventListener) => {
      if (event === 'statechange') {
        waitingStateChangeListener = listener;
      }
    });
    serviceWorkerAddEventListener.mockImplementation((event: string, listener: EventListener) => {
      if (event === 'controllerchange') {
        controllerChangeListener = listener;
      }
    });

    const applyPromise = applyPendingAppUpdate();
    await vi.advanceTimersByTimeAsync(0);

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING_AND_CLAIM' });

    mockRegistration.waiting = null;
    mockRegistration.active = activeWorker;
    waitingStateChangeListener?.(new Event('statechange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(activeWorker.postMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();

    controllerChangeListener?.(new Event('controllerchange'));
    await applyPromise;

    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('asks the active update worker to claim clients before reloading', async () => {
    const activeWorker = { postMessage: vi.fn() };
    const controllerWorker = { postMessage: vi.fn() };
    let controllerChangeListener: EventListener | undefined;
    mockRegistration.active = activeWorker;
    serviceWorkerAddEventListener.mockImplementation((event: string, listener: EventListener) => {
      if (event === 'controllerchange') {
        controllerChangeListener = listener;
      }
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: controllerWorker,
          getRegistration: vi.fn().mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
          addEventListener: serviceWorkerAddEventListener,
          removeEventListener: serviceWorkerRemoveEventListener,
        },
      },
    });

    const applyPromise = applyPendingAppUpdate();
    await vi.advanceTimersByTimeAsync(0);

    expect(activeWorker.postMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();

    controllerChangeListener?.(new Event('controllerchange'));
    await applyPromise;

    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('reloads after a timeout if controllerchange never arrives', async () => {
    const waitingWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockRegistration.waiting = waitingWorker;

    const applyPromise = applyPendingAppUpdate();
    await vi.advanceTimersByTimeAsync(0);

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING_AND_CLAIM' });
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4000);
    await applyPromise;

    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('does not reload when there is no pending app update to apply', async () => {
    await applyPendingAppUpdate();

    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();
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
