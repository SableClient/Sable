/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingAppUpdate, checkForAppUpdates } from './appUpdates';

const { mockHasServiceWorker } = vi.hoisted(() => ({
  mockHasServiceWorker: vi.fn(),
}));

const { mockReloadWithTelemetry } = vi.hoisted(() => ({
  mockReloadWithTelemetry: vi.fn<(reason: string) => void>(),
}));

const { mockClearClientCachesAndServiceWorkers } = vi.hoisted(() => ({
  mockClearClientCachesAndServiceWorkers: vi.fn<() => Promise<void>>(),
}));

vi.mock('$utils/platform', () => ({
  hasServiceWorker: mockHasServiceWorker,
}));

vi.mock('$utils/appCacheReset', () => ({
  clearClientCachesAndServiceWorkers: mockClearClientCachesAndServiceWorkers,
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
  scope: string;
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

const createRegistration = (scope = '/'): MockRegistration => ({
  scope,
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
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockHasServiceWorker.mockReturnValue(true);
    mockReloadWithTelemetry.mockReset();
    mockClearClientCachesAndServiceWorkers.mockReset();
    mockClearClientCachesAndServiceWorkers.mockResolvedValue(undefined);
    mockRegistration = createRegistration();
    mockReload = vi.fn();
    serviceWorkerAddEventListener = vi.fn();
    serviceWorkerRemoveEventListener = vi.fn();
    fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="/assets/index-current.css" />
            </head>
            <body>
              <script type="module" src="/assets/index-current.js"></script>
            </body>
          </html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(mockRegistration),
          getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
          ready: Promise.resolve(mockRegistration),
          addEventListener: serviceWorkerAddEventListener,
          removeEventListener: serviceWorkerRemoveEventListener,
        },
      },
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://charm.local/app/room',
        origin: 'https://charm.local',
        pathname: '/app/room',
        reload: mockReload,
      },
    });

    document.head.innerHTML = '<link rel="stylesheet" href="/assets/index-current.css">';
    document.body.innerHTML = '<script type="module" src="/assets/index-current.js"></script>';
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
          getRegistrations: vi.fn().mockResolvedValue([
            {
              ...mockRegistration,
              active: activeWorker,
            },
          ]),
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

  it('reports an available update when the hosted app shell assets differ', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="/assets/index-next.css" />
            </head>
            <body>
              <script type="module" src="/assets/index-next.js"></script>
            </body>
          </html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'A newer hosted app version is ready to apply.',
      canApply: true,
    });
  });

  it('checks all known registrations before reporting up to date', async () => {
    const currentRegistration = createRegistration('/current');
    const staleRegistration = createRegistration('/stale');
    const waitingWorker = { postMessage: vi.fn() };
    const controllerWorker = { postMessage: vi.fn() };

    staleRegistration.update.mockImplementation(async () => {
      staleRegistration.waiting = waitingWorker;
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: controllerWorker,
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, staleRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });
    expect(currentRegistration.update).toHaveBeenCalledTimes(1);
    expect(staleRegistration.update).toHaveBeenCalledTimes(1);
  });

  it('ignores registrations outside the current app scope', async () => {
    const currentRegistration = createRegistration('https://charm.local/app/');
    const unrelatedRegistration = createRegistration('https://charm.local/legacy/');
    unrelatedRegistration.waiting = { postMessage: vi.fn() };

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, unrelatedRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
    expect(unrelatedRegistration.update).not.toHaveBeenCalled();
  });

  it('uses the longest matching scope when multiple registrations match the current url', async () => {
    const currentRegistration = createRegistration('https://charm.local/app/');
    const broaderRegistration = createRegistration('https://charm.local/');
    broaderRegistration.waiting = { postMessage: vi.fn() };

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, broaderRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
    expect(broaderRegistration.update).not.toHaveBeenCalled();
  });

  it('does not wait for serviceWorker.ready once direct registrations are available', async () => {
    const ready = new Promise<ServiceWorkerRegistration>(() => undefined);

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(mockRegistration),
          getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
          ready,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
  });

  it('falls back to serviceWorker.ready when direct lookups produce no registration', async () => {
    const readyRegistration = createRegistration('https://charm.local/app/');

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(undefined),
          getRegistrations: vi.fn().mockResolvedValue([]),
          ready: Promise.resolve(readyRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
    expect(readyRegistration.update).toHaveBeenCalledTimes(1);
  });

  it('fails when any update probe errors and no update is found', async () => {
    const currentRegistration = createRegistration('/current');
    const secondaryRegistration = createRegistration('/secondary');
    secondaryRegistration.update.mockRejectedValueOnce(new TypeError('network failed'));

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, secondaryRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates().catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe(
      'Failed to check for updates. Reload the app and try again.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the hosted shell check when one service worker probe fails', async () => {
    const currentRegistration = createRegistration('/current');
    const secondaryRegistration = createRegistration('/secondary');
    secondaryRegistration.update.mockRejectedValueOnce(new TypeError('network failed'));
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="/assets/index-next.css" />
            </head>
            <body>
              <script type="module" src="/assets/index-next.js"></script>
            </body>
          </html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, secondaryRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'A newer hosted app version is ready to apply.',
      canApply: true,
    });
  });

  it('returns once any registration confirms an update', async () => {
    const currentRegistration = createRegistration('/current');
    const secondaryRegistration = createRegistration('/secondary');
    secondaryRegistration.update.mockImplementation(async () => {
      secondaryRegistration.waiting = { postMessage: vi.fn() };
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, secondaryRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
    });

    const resultPromise = checkForAppUpdates();
    await vi.advanceTimersByTimeAsync(0);

    await expect(resultPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });
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
          getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
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
    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('applies a waiting update discovered on a secondary registration', async () => {
    const currentRegistration = createRegistration('/current');
    const staleRegistration = createRegistration('/stale');
    const waitingWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    let controllerChangeListener: EventListener | undefined;
    staleRegistration.waiting = waitingWorker;
    serviceWorkerAddEventListener.mockImplementation((event: string, listener: EventListener) => {
      if (event === 'controllerchange') {
        controllerChangeListener = listener;
      }
    });

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: { postMessage: vi.fn() },
          getRegistration: vi.fn().mockResolvedValue(currentRegistration),
          getRegistrations: vi.fn().mockResolvedValue([currentRegistration, staleRegistration]),
          ready: Promise.resolve(currentRegistration),
          addEventListener: serviceWorkerAddEventListener,
          removeEventListener: serviceWorkerRemoveEventListener,
        },
      },
    });

    const applyPromise = applyPendingAppUpdate();
    await vi.advanceTimersByTimeAsync(0);

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING_AND_CLAIM' });

    controllerChangeListener?.(new Event('controllerchange'));
    await applyPromise;

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
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

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
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
          getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
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

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
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

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('does not reload when there is no pending app update to apply', async () => {
    await applyPendingAppUpdate();

    expect(mockClearClientCachesAndServiceWorkers).not.toHaveBeenCalled();
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();
  });

  it('reloads by clearing caches and unregistering service workers when the hosted shell changed', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="/assets/index-next.css" />
            </head>
            <body>
              <script type="module" src="/assets/index-next.js"></script>
            </body>
          </html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    await applyPendingAppUpdate();

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('reloads a hosted shell update without touching navigator.serviceWorker on unsupported platforms', async () => {
    mockHasServiceWorker.mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="/assets/index-next.css" />
            </head>
            <body>
              <script type="module" src="/assets/index-next.js"></script>
            </body>
          </html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {},
    });

    await applyPendingAppUpdate();

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('does nothing when applying an update cannot confirm the hosted shell and no pending worker exists', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network failed'));

    await applyPendingAppUpdate();

    expect(mockClearClientCachesAndServiceWorkers).not.toHaveBeenCalled();
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();
  });

  it('applies a previously detected hosted shell update even if the follow-up probe fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          `
            <!doctype html>
            <html>
              <head>
                <link rel="stylesheet" href="/assets/index-next.css" />
              </head>
              <body>
                <script type="module" src="/assets/index-next.js"></script>
              </body>
            </html>
          `,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        )
      )
      .mockRejectedValueOnce(new TypeError('network failed'));

    const resultPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'A newer hosted app version is ready to apply.',
      canApply: true,
    });

    await applyPendingAppUpdate();

    expect(mockClearClientCachesAndServiceWorkers).toHaveBeenCalledWith({
      unregisterServiceWorkers: true,
    });
    expect(mockReloadWithTelemetry).toHaveBeenCalledWith('apply_pending_app_update');
  });

  it('clears a stale hosted shell update detection after a later up-to-date check', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          `
            <!doctype html>
            <html>
              <head>
                <link rel="stylesheet" href="/assets/index-next.css" />
              </head>
              <body>
                <script type="module" src="/assets/index-next.js"></script>
              </body>
            </html>
          `,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          `
            <!doctype html>
            <html>
              <head>
                <link rel="stylesheet" href="/assets/index-current.css" />
              </head>
              <body>
                <script type="module" src="/assets/index-current.js"></script>
              </body>
            </html>
          `,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        )
      )
      .mockRejectedValueOnce(new TypeError('network failed'));

    const firstCheckPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();
    await expect(firstCheckPromise).resolves.toEqual({
      kind: 'update-available',
      message: 'A newer hosted app version is ready to apply.',
      canApply: true,
    });

    const secondCheckPromise = checkForAppUpdates();
    await vi.runAllTimersAsync();
    await expect(secondCheckPromise).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });

    await applyPendingAppUpdate();

    expect(mockClearClientCachesAndServiceWorkers).not.toHaveBeenCalled();
    expect(mockReloadWithTelemetry).not.toHaveBeenCalled();
  });

  it('reports hosted updates even when service workers are unavailable', async () => {
    mockHasServiceWorker.mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="/assets/index-next.css" />
            </head>
            <body>
              <script type="module" src="/assets/index-next.js"></script>
            </body>
          </html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    await expect(checkForAppUpdates()).resolves.toEqual({
      kind: 'update-available',
      message: 'A newer hosted app version is ready to apply.',
      canApply: true,
    });
  });

  it('reports up to date when the hosted shell matches and service workers are unavailable', async () => {
    mockHasServiceWorker.mockReturnValue(false);

    await expect(checkForAppUpdates()).resolves.toEqual({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
  });

  it('reports native updater unsupported when service workers are unavailable and hosted checks fail', async () => {
    mockHasServiceWorker.mockReturnValue(false);
    fetchMock.mockRejectedValueOnce(new TypeError('network failed'));

    await expect(checkForAppUpdates()).resolves.toEqual({
      kind: 'native-unsupported',
      message: 'Native binary update checking is not configured in this build.',
      canApply: false,
    });
  });
});
