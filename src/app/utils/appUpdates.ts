import { hasServiceWorker } from '$utils/platform';
import { reloadWithTelemetry } from '$utils/reloadWithTelemetry';

const UPDATE_CHECK_TIMEOUT_MS = 2500;
const APPLY_UPDATE_TIMEOUT_MS = 4000;
const UPDATE_CHECK_FAILURE_MESSAGE = 'Failed to check for updates. Reload the app and try again.';

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
    const hasPendingActiveUpdate = () =>
      !!(
        navigator.serviceWorker.controller &&
        registration.active &&
        registration.active !== navigator.serviceWorker.controller
      );

    if (registration.waiting && navigator.serviceWorker.controller) {
      resolve(true);
      return;
    }

    if (hasPendingActiveUpdate()) {
      resolve(true);
      return;
    }

    let settled = false;
    let timeoutId = 0;
    let observedInstallingWorker: ServiceWorker | null = registration.installing;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      registration.removeEventListener('updatefound', handleUpdateFound);
      observedInstallingWorker?.removeEventListener('statechange', handleInstallingState);
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
        return;
      }

      if (hasPendingActiveUpdate()) {
        finish(true);
      }
    };

    const handleUpdateFound = () => {
      observedInstallingWorker = registration.installing;
      observedInstallingWorker?.addEventListener('statechange', handleInstallingState);
    };

    timeoutId = window.setTimeout(() => finish(false), UPDATE_CHECK_TIMEOUT_MS);

    registration.addEventListener('updatefound', handleUpdateFound, { once: true });
    observedInstallingWorker?.addEventListener('statechange', handleInstallingState);
  });

const waitForServiceWorkerControllerChange = async (): Promise<void> =>
  new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      resolve();
    };

    const handleControllerChange = () => finish();

    timeoutId = window.setTimeout(finish, APPLY_UPDATE_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, {
      once: true,
    });
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

  if (
    navigator.serviceWorker.controller &&
    registration.active &&
    registration.active !== navigator.serviceWorker.controller
  ) {
    return {
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    };
  }

  try {
    await registration.update();
  } catch (error) {
    throw error instanceof Error
      ? new Error(UPDATE_CHECK_FAILURE_MESSAGE, { cause: error })
      : new Error(UPDATE_CHECK_FAILURE_MESSAGE);
  }

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
    const waitForControllerChange = waitForServiceWorkerControllerChange();
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
    await waitForControllerChange;
  }

  reloadWithTelemetry('apply_pending_app_update');
}
