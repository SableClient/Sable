import { hasServiceWorker } from '$utils/platform';

/**
 * Keep in sync with src/sw.ts — bump both when the media-auth interception
 * protocol changes.
 */
const SW_MEDIA_AUTH_PROTOCOL_VERSION = 1;

const PROBE_TIMEOUT_MS = 1500;

type SWMediaAuthListener = (supported: boolean) => void;

let cachedSupport: boolean | undefined;
let inflightProbe: Promise<boolean> | undefined;
let probedController: ServiceWorker | null | undefined;
const listeners = new Set<SWMediaAuthListener>();

function notify(supported: boolean): void {
  listeners.forEach((listener) => listener(supported));
}

export function getCachedSWMediaAuthSupport(): boolean | undefined {
  return cachedSupport;
}

export function subscribeSWMediaAuthSupport(listener: SWMediaAuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function probeSWMediaAuthSupport(): Promise<boolean> {
  if (!hasServiceWorker()) {
    cachedSupport = false;
    notify(false);
    return Promise.resolve(false);
  }

  const { controller } = navigator.serviceWorker;
  if (!controller) {
    cachedSupport = false;
    notify(false);
    return Promise.resolve(false);
  }

  if (probedController === controller) {
    if (inflightProbe) return inflightProbe;
    if (cachedSupport !== undefined) return Promise.resolve(cachedSupport);
  }

  probedController = controller;
  inflightProbe = new Promise<boolean>((resolve) => {
    let channel: MessageChannel | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: unknown; supported?: unknown; version?: unknown };
      finish(
        data?.type === 'swMediaAuth' &&
          data?.supported === true &&
          typeof data?.version === 'number' &&
          data.version >= SW_MEDIA_AUTH_PROTOCOL_VERSION
      );
    };
    const finish = (supported: boolean, shouldCache = true) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      channel?.port1.removeEventListener('message', onMessage);
      channel?.port1.close();
      // Controller may have changed mid-probe; activation resets the cache and
      // starts a fresh probe, so don't clobber that state with a stale answer.
      if (navigator.serviceWorker.controller === controller) {
        if (shouldCache) {
          cachedSupport = supported;
          notify(supported);
        }
      }
      resolve(supported);
    };

    try {
      channel = new MessageChannel();
      timeoutId = setTimeout(() => finish(false, false), PROBE_TIMEOUT_MS);
      channel.port1.addEventListener('message', onMessage);
      channel.port1.start();

      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      controller.postMessage({ type: 'swMediaAuthProbe' }, [channel.port2]);
    } catch {
      // The controller can become redundant between reading it and posting the
      // probe. Treat that race like any other unsupported controller so callers
      // can use their authenticated blob fallback.
      channel?.port2.close();
      finish(false);
    }
  })
    .catch(() => false)
    .finally(() => {
      if (probedController === controller) {
        inflightProbe = undefined;
      }
    });

  return inflightProbe;
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && hasServiceWorker()) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const { controller } = navigator.serviceWorker;
    cachedSupport = controller ? undefined : false;
    inflightProbe = undefined;
    probedController = undefined;
    if (!controller) {
      notify(false);
      return;
    }
    // A speculative `false` would flip every mounted consumer to the blob path and back.
    void probeSWMediaAuthSupport();
  });
}
