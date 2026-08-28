import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  hasServiceWorker: vi.fn<() => boolean>(),
}));

vi.mock('$utils/platform', () => platform);

function stubServiceWorker(controller: unknown) {
  const serviceWorker = {
    controller,
    addEventListener: vi.fn<(...args: unknown[]) => void>(),
    removeEventListener: vi.fn<(...args: unknown[]) => void>(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });
  return serviceWorker;
}

describe('swMediaAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    platform.hasServiceWorker.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves false without a service worker runtime', async () => {
    platform.hasServiceWorker.mockReturnValue(false);
    const mod = await import('./swMediaAuth');

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(false);
    expect(mod.getCachedSWMediaAuthSupport()).toBe(false);
  });

  it('resolves false when no service worker controls the page', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    stubServiceWorker(null);
    const mod = await import('./swMediaAuth');

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(false);
    expect(mod.getCachedSWMediaAuthSupport()).toBe(false);
  });

  it('resolves true and notifies listeners when the service worker answers the probe', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    const postMessage = vi.fn<(...args: unknown[]) => void>((...args: unknown[]) => {
      const [port] = args[1] as MessagePort[];
      port?.postMessage({ type: 'swMediaAuth', supported: true, version: 1 });
    });
    stubServiceWorker({ postMessage });
    const mod = await import('./swMediaAuth');
    const listener = vi.fn<(supported: boolean) => void>();
    const unsubscribe = mod.subscribeSWMediaAuthSupport(listener);

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(true);

    expect(mod.getCachedSWMediaAuthSupport()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
  });

  it('resolves false when the probe times out', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    stubServiceWorker({ postMessage: vi.fn<() => void>() });
    const mod = await import('./swMediaAuth');

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(false);
    expect(mod.getCachedSWMediaAuthSupport()).toBeUndefined();
  }, 10_000);

  it('retries a timed-out probe for the same controller', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    let probeCount = 0;
    const postMessage = vi.fn<(...args: unknown[]) => void>((...args: unknown[]) => {
      probeCount += 1;
      if (probeCount === 2) {
        const [port] = args[1] as MessagePort[];
        port?.postMessage({ type: 'swMediaAuth', supported: true, version: 1 });
      }
    });
    stubServiceWorker({ postMessage });
    const mod = await import('./swMediaAuth');

    const firstProbe = mod.probeSWMediaAuthSupport();
    expect(postMessage).toHaveBeenCalledOnce();
    await expect(firstProbe).resolves.toBe(false);
    expect(mod.getCachedSWMediaAuthSupport()).toBeUndefined();

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('keeps listeners on the proven path while a replacement controller probe is unresolved', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    const firstController = {
      postMessage: vi.fn<(...args: unknown[]) => void>((...args: unknown[]) => {
        const [port] = args[1] as MessagePort[];
        port?.postMessage({ type: 'swMediaAuth', supported: true, version: 1 });
      }),
    };
    const serviceWorker = stubServiceWorker(firstController);
    const mod = await import('./swMediaAuth');
    const listener = vi.fn<(supported: boolean) => void>();
    mod.subscribeSWMediaAuthSupport(listener);

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(true);
    listener.mockClear();
    vi.useFakeTimers();

    const replacement = { postMessage: vi.fn<() => void>() };
    serviceWorker.controller = replacement;
    const controllerChange = serviceWorker.addEventListener.mock.calls.find(
      ([type]) => type === 'controllerchange'
    )?.[1] as (() => void) | undefined;
    controllerChange?.();

    expect(controllerChange).toBeTypeOf('function');
    expect(listener).not.toHaveBeenCalled();
    expect(replacement.postMessage).toHaveBeenCalledOnce();
    expect(mod.getCachedSWMediaAuthSupport()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1500);
    expect(mod.getCachedSWMediaAuthSupport()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies unsupported when the page loses its controller', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    const serviceWorker = stubServiceWorker({
      postMessage: vi.fn<(...args: unknown[]) => void>((...args: unknown[]) => {
        const [port] = args[1] as MessagePort[];
        port?.postMessage({ type: 'swMediaAuth', supported: true, version: 1 });
      }),
    });
    const mod = await import('./swMediaAuth');
    const listener = vi.fn<(supported: boolean) => void>();
    mod.subscribeSWMediaAuthSupport(listener);

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(true);
    listener.mockClear();

    serviceWorker.controller = null;
    const controllerChange = serviceWorker.addEventListener.mock.calls.find(
      ([type]) => type === 'controllerchange'
    )?.[1] as (() => void) | undefined;
    controllerChange?.();

    expect(listener).toHaveBeenCalledWith(false);
    expect(mod.getCachedSWMediaAuthSupport()).toBe(false);
  });

  it('resolves false when posting the probe throws', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    stubServiceWorker({
      postMessage: vi.fn<() => void>(() => {
        throw new Error('postMessage failed');
      }),
    });
    const mod = await import('./swMediaAuth');

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(false);
    expect(mod.getCachedSWMediaAuthSupport()).toBe(false);
  });

  it('resolves false when posting to a stale controller throws', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    const postMessage = vi.fn<() => void>(() => {
      throw new DOMException('The service worker is redundant', 'InvalidStateError');
    });
    stubServiceWorker({ postMessage });
    const mod = await import('./swMediaAuth');
    const listener = vi.fn<(supported: boolean) => void>();
    mod.subscribeSWMediaAuthSupport(listener);

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(false);

    expect(mod.getCachedSWMediaAuthSupport()).toBe(false);
    expect(listener).toHaveBeenCalledWith(false);
  });

  it('serves subsequent probes from cache for the same controller', async () => {
    platform.hasServiceWorker.mockReturnValue(true);
    const postMessage = vi.fn<(...args: unknown[]) => void>((...args: unknown[]) => {
      const [port] = args[1] as MessagePort[];
      port?.postMessage({ type: 'swMediaAuth', supported: true, version: 1 });
    });
    stubServiceWorker({ postMessage });
    const mod = await import('./swMediaAuth');

    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(true);
    await expect(mod.probeSWMediaAuthSupport()).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
