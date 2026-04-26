type ServiceWorkerSessionPayload = {
  type: 'setSession';
  accessToken?: string;
  baseUrl?: string;
  userId?: string;
};

function postSessionPayload(
  target: ServiceWorker | null | undefined,
  payload: ServiceWorkerSessionPayload,
  seenTargets: WeakSet<ServiceWorker>
) {
  if (!target || seenTargets.has(target)) return false;
  seenTargets.add(target);
  target.postMessage(payload);
  return true;
}

export function pushSessionToSW(baseUrl?: string, accessToken?: string, userId?: string): boolean {
  if (!('serviceWorker' in navigator)) return false;

  const payload: ServiceWorkerSessionPayload = {
    type: 'setSession',
    accessToken,
    baseUrl,
    userId,
  };
  const seenTargets = new WeakSet<ServiceWorker>();
  postSessionPayload(navigator.serviceWorker.controller, payload, seenTargets);

  // Backgrounded/mobile browsers can drop the current controller reference even
  // though the registration is still active. Post to any reachable worker from
  // navigator.serviceWorker.ready so the session is restored without a reload.
  navigator.serviceWorker.ready
    .then((registration) => {
      postSessionPayload(registration.active, payload, seenTargets);
      postSessionPayload(registration.waiting, payload, seenTargets);
      postSessionPayload(registration.installing, payload, seenTargets);
    })
    .catch(() => undefined);

  // Treat a queued ready() delivery as a successful attempt so foreground/heartbeat
  // recovery keeps running even if controller is temporarily absent.
  return true;
}
