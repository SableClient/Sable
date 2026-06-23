import { clearClientCachesAndServiceWorkers } from '$utils/appCacheReset';
import { hasServiceWorker } from '$utils/platform';
import { reloadWithTelemetry } from '$utils/reloadWithTelemetry';

const UPDATE_CHECK_TIMEOUT_MS = 8000;
const APPLY_UPDATE_TIMEOUT_MS = 4000;
const UPDATE_CHECK_FAILURE_MESSAGE = 'Failed to check for updates. Reload the app and try again.';
const HOSTED_SHELL_CHECK_TIMEOUT_MS = 5000;
const APP_SHELL_ASSET_PATHNAME = /^\/assets\/.+\.(?:css|js|mjs)$/;

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

export const hasPendingAppUpdate = (registration: ServiceWorkerRegistration | undefined): boolean =>
  !!(
    registration &&
    navigator.serviceWorker.controller &&
    (registration.waiting ||
      (registration.active && registration.active !== navigator.serviceWorker.controller))
  );

const getUniqueRegistrations = (
  registrations: Array<ServiceWorkerRegistration | undefined>
): ServiceWorkerRegistration[] => {
  const uniqueRegistrations = new Map<string, ServiceWorkerRegistration>();
  registrations.forEach((registration) => {
    if (!registration) return;
    uniqueRegistrations.set(registration.scope, registration);
  });
  return [...uniqueRegistrations.values()];
};

const getCurrentAppUrl = (): URL | undefined => {
  try {
    return new URL(window.location.href);
  } catch {
    return undefined;
  }
};

const normalizeAssetUrlPath = (value: string): string | undefined => {
  try {
    const url = new URL(value, window.location.origin);
    return APP_SHELL_ASSET_PATHNAME.test(url.pathname) ? url.pathname : undefined;
  } catch {
    return undefined;
  }
};

const getCurrentDocumentAppShellAssetSignature = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;

  const assetPaths = Array.from(
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')
  )
    .map((element) =>
      normalizeAssetUrlPath(element instanceof HTMLScriptElement ? element.src : element.href)
    )
    .filter((assetPath): assetPath is string => assetPath !== undefined)
    .toSorted();

  return assetPaths.length > 0 ? assetPaths.join('|') : undefined;
};

const getHostedAppShellUrl = (): URL | undefined => {
  try {
    return new URL(document.baseURI);
  } catch {
    return getCurrentAppUrl();
  }
};

const getHostedDocumentAppShellAssetSignature = (html: string): string | undefined => {
  if (typeof DOMParser === 'undefined') return undefined;

  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  const assetPaths = Array.from(
    parsedDocument.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')
  )
    .map((element) => {
      const rawValue =
        element instanceof HTMLScriptElement
          ? element.getAttribute('src')
          : element.getAttribute('href');
      return rawValue ? normalizeAssetUrlPath(rawValue) : undefined;
    })
    .filter((assetPath): assetPath is string => assetPath !== undefined)
    .toSorted();

  return assetPaths.length > 0 ? assetPaths.join('|') : undefined;
};

const fetchHostedAppShellAssetSignature = async (): Promise<string | undefined> => {
  const hostedShellUrl = getHostedAppShellUrl();
  if (!hostedShellUrl) return undefined;

  hostedShellUrl.searchParams.set('__app_update_check', Date.now().toString(36));
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => abortController.abort(), HOSTED_SHELL_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(hostedShellUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: abortController.signal,
    });
    if (!response.ok) return undefined;
    return getHostedDocumentAppShellAssetSignature(await response.text());
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const hasHostedAppShellUpdate = async (): Promise<boolean> => {
  const currentSignature = getCurrentDocumentAppShellAssetSignature();
  if (!currentSignature) return false;

  const hostedSignature = await fetchHostedAppShellAssetSignature();
  return !!hostedSignature && hostedSignature !== currentSignature;
};

const getWinningScopeRegistrations = (
  registrations: ServiceWorkerRegistration[],
  currentAppUrl: URL | undefined
): ServiceWorkerRegistration[] => {
  if (!currentAppUrl) return registrations;

  const matchingRegistrations = registrations
    .map((registration) => {
      try {
        const scopeUrl = new URL(registration.scope, currentAppUrl);
        return currentAppUrl.href.startsWith(scopeUrl.href)
          ? { registration, scopeLength: scopeUrl.href.length }
          : undefined;
      } catch {
        return undefined;
      }
    })
    .filter(
      (candidate): candidate is { registration: ServiceWorkerRegistration; scopeLength: number } =>
        candidate !== undefined
    );

  if (matchingRegistrations.length === 0) return [];

  const longestScopeLength = Math.max(
    ...matchingRegistrations.map((candidate) => candidate.scopeLength)
  );
  return matchingRegistrations
    .filter((candidate) => candidate.scopeLength === longestScopeLength)
    .map((candidate) => candidate.registration);
};

const getAppServiceWorkerRegistrations = async (): Promise<ServiceWorkerRegistration[]> => {
  if (!hasServiceWorker()) return [];

  const registrations: Array<ServiceWorkerRegistration | undefined> = [];

  try {
    registrations.push(await navigator.serviceWorker.getRegistration());
  } catch {
    // Continue with the other registration sources below.
  }

  try {
    registrations.push(...(await navigator.serviceWorker.getRegistrations()));
  } catch {
    // Some environments only expose getRegistration/ready.
  }

  const currentAppUrl = getCurrentAppUrl();
  const directRegistrations = getUniqueRegistrations(registrations);
  const scopedDirectRegistrations = getWinningScopeRegistrations(
    directRegistrations,
    currentAppUrl
  );
  if (scopedDirectRegistrations.length > 0) {
    return scopedDirectRegistrations;
  }

  if (directRegistrations.length > 0) {
    return directRegistrations;
  }

  try {
    registrations.push(await navigator.serviceWorker.ready);
  } catch {
    // No ready registration to add.
  }

  const readyRegistrations = getUniqueRegistrations(registrations);
  const scopedReadyRegistrations = getWinningScopeRegistrations(readyRegistrations, currentAppUrl);
  return scopedReadyRegistrations.length > 0 ? scopedReadyRegistrations : readyRegistrations;
};

const getPendingAppUpdateRegistration = (
  registrations: ServiceWorkerRegistration[]
): ServiceWorkerRegistration | undefined =>
  registrations.find((registration) => hasPendingAppUpdate(registration));

const waitForWaitingServiceWorker = async (
  registration: ServiceWorkerRegistration,
  signal?: AbortSignal
): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    if (hasPendingAppUpdate(registration)) {
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
      signal?.removeEventListener('abort', handleAbort);
    };

    const finish = (waiting: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(waiting);
    };

    const handleInstallingState = () => {
      if (hasPendingAppUpdate(registration)) {
        finish(true);
      }
    };

    const handleUpdateFound = () => {
      observedInstallingWorker = registration.installing;
      observedInstallingWorker?.addEventListener('statechange', handleInstallingState);
    };

    const handleAbort = () => finish(false);

    timeoutId = window.setTimeout(() => finish(false), UPDATE_CHECK_TIMEOUT_MS);

    registration.addEventListener('updatefound', handleUpdateFound, { once: true });
    observedInstallingWorker?.addEventListener('statechange', handleInstallingState);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });

const waitForAnyWaitingServiceWorker = async (
  registrations: ServiceWorkerRegistration[]
): Promise<boolean> => {
  const abortController = new AbortController();

  try {
    await Promise.any(
      registrations.map(async (registration) => {
        const waiting = await waitForWaitingServiceWorker(registration, abortController.signal);
        if (!waiting) {
          throw new Error('No update for registration');
        }
        return true;
      })
    );
    return true;
  } catch {
    return false;
  } finally {
    abortController.abort();
  }
};

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

const waitForUpdatedActiveServiceWorker = async (
  registration: ServiceWorkerRegistration,
  currentController: ServiceWorker | null
): Promise<ServiceWorker | undefined> =>
  new Promise((resolve) => {
    const getUpdatedActiveWorker = () => {
      const activeWorker = registration.active;
      return activeWorker && activeWorker !== currentController ? activeWorker : undefined;
    };

    const activeWorker = getUpdatedActiveWorker();
    if (activeWorker) {
      resolve(activeWorker);
      return;
    }

    let settled = false;
    let timeoutId = 0;
    let observedWorker: ServiceWorker | null = registration.waiting ?? registration.installing;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      registration.removeEventListener('updatefound', handleUpdateFound);
      observedWorker?.removeEventListener('statechange', handleWorkerStateChange);
    };

    const finish = (worker?: ServiceWorker) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(worker);
    };

    const handleWorkerStateChange = () => {
      finish(getUpdatedActiveWorker());
    };

    const handleUpdateFound = () => {
      observedWorker?.removeEventListener('statechange', handleWorkerStateChange);
      observedWorker = registration.installing;
      observedWorker?.addEventListener('statechange', handleWorkerStateChange);
    };

    timeoutId = window.setTimeout(() => finish(getUpdatedActiveWorker()), APPLY_UPDATE_TIMEOUT_MS);

    registration.addEventListener('updatefound', handleUpdateFound);
    observedWorker?.addEventListener('statechange', handleWorkerStateChange);
  });

export async function checkForAppUpdates(): Promise<AppUpdateCheckResult> {
  const registrations = await getAppServiceWorkerRegistrations();
  if (registrations.length === 0) {
    return {
      kind: 'native-unsupported',
      message: 'Native binary update checking is not configured in this build.',
      canApply: false,
    };
  }

  if (getPendingAppUpdateRegistration(registrations)) {
    return {
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    };
  }

  const updateResults = await Promise.allSettled(
    registrations.map(async (registration) => {
      await registration.update();
      return registration;
    })
  );
  const successfulUpdates = updateResults.filter(
    (result): result is PromiseFulfilledResult<ServiceWorkerRegistration> =>
      result.status === 'fulfilled'
  );
  const rejectedUpdates = updateResults.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  const updateAvailable =
    successfulUpdates.length > 0 &&
    (await waitForAnyWaitingServiceWorker(
      successfulUpdates.map(({ value: registration }) => registration)
    ));
  if (updateAvailable) {
    return {
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    };
  }

  if (await hasHostedAppShellUpdate()) {
    return {
      kind: 'update-available',
      message: 'A newer hosted app version is ready to apply.',
      canApply: true,
    };
  }

  if (successfulUpdates.length === 0 || rejectedUpdates.length > 0) {
    const firstError = rejectedUpdates[0]?.reason;
    throw firstError instanceof Error
      ? new Error(UPDATE_CHECK_FAILURE_MESSAGE, { cause: firstError })
      : new Error(UPDATE_CHECK_FAILURE_MESSAGE);
  }

  return {
    kind: 'up-to-date',
    message: 'You are already on the latest available web app version.',
    canApply: false,
  };
}

export async function applyPendingAppUpdate(): Promise<void> {
  const registrations = await getAppServiceWorkerRegistrations();
  const registration = getPendingAppUpdateRegistration(registrations);
  const hostedUpdateAvailable = await hasHostedAppShellUpdate();
  if (!registration && !hostedUpdateAvailable) return;

  const currentController = navigator.serviceWorker.controller;

  if (registration?.waiting) {
    const waitForControllerChange = waitForServiceWorkerControllerChange();
    const waitForUpdatedActiveWorker = waitForUpdatedActiveServiceWorker(
      registration,
      currentController
    );
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
    const activeWorker = await Promise.race([
      waitForUpdatedActiveWorker,
      waitForControllerChange.then(() => navigator.serviceWorker.controller ?? undefined),
    ]);
    if (activeWorker && activeWorker !== navigator.serviceWorker.controller) {
      // Retry the claim from the page side in case the waiting worker restarts
      // between receiving the apply request and finishing activation.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      activeWorker.postMessage({ type: 'CLAIM_CLIENTS' });
    }
    await waitForControllerChange;
  } else if (registration?.active && registration.active !== currentController) {
    const waitForControllerChange = waitForServiceWorkerControllerChange();
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    registration.active.postMessage({ type: 'CLAIM_CLIENTS' });
    await waitForControllerChange;
  }

  await clearClientCachesAndServiceWorkers({ unregisterServiceWorkers: true });
  reloadWithTelemetry('apply_pending_app_update');
}
