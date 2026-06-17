import { hasServiceWorker } from '$utils/platform';

const UPDATE_CHECK_TIMEOUT_MS = 2500;

export type AppUpdateCheckResult =
  | {
      kind: 'update-available';
      message: string;
      canApply: true;
    }
  | {
      kind: 'up-to-date';
      message: string;
      canApply: false;
    }
  | {
      kind: 'native-unsupported';
      message: string;
      canApply: false;
    };

const getAppServiceWorkerRegistration = async (): Promise<
  ServiceWorkerRegistration | undefined
> => {
  if (!hasServiceWorker()) return undefined;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) return registration;
  } catch {
    // Fall back to ready below.
  }

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return undefined;
  }
};

const waitForWaitingServiceWorker = async (
  registration: ServiceWorkerRegistration
): Promise<boolean> =>
  new Promise((resolve) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      resolve(true);
      return;
    }

    let settled = false;
    let timeoutId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      registration.removeEventListener('updatefound', handleUpdateFound);
      registration.installing?.removeEventListener('statechange', handleInstallingState);
    };

    const finish = (waiting: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(waiting);
    };

    const handleInstallingState = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        finish(true);
      }
    };

    const handleUpdateFound = () => {
      registration.installing?.addEventListener('statechange', handleInstallingState);
    };

    timeoutId = window.setTimeout(() => finish(false), UPDATE_CHECK_TIMEOUT_MS);

    registration.addEventListener('updatefound', handleUpdateFound, { once: true });
    registration.installing?.addEventListener('statechange', handleInstallingState);
  });

export async function checkForAppUpdates(): Promise<AppUpdateCheckResult> {
  const registration = await getAppServiceWorkerRegistration();
  if (!registration) {
    return {
      kind: 'native-unsupported',
      message: 'Native binary update checking is not configured in this build.',
      canApply: false,
    };
  }

  if (registration.waiting && navigator.serviceWorker.controller) {
    return {
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    };
  }

  await registration.update();
  const waiting = await waitForWaitingServiceWorker(registration);
  if (waiting) {
    return {
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    };
  }

  return {
    kind: 'up-to-date',
    message: 'You are already on the latest available web app version.',
    canApply: false,
  };
}

export async function applyPendingAppUpdate(): Promise<void> {
  const registration = await getAppServiceWorkerRegistration();
  if (!registration) return;

  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' }, self.location.origin);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.location.reload();
      },
      { once: true }
    );
    return;
  }

  window.location.reload();
}
