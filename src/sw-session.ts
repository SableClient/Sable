export function pushSessionToSW(baseUrl?: string, accessToken?: string, userId?: string) {
  if (!('serviceWorker' in navigator)) return;

  const message = {
    type: 'setSession',
    accessToken,
    baseUrl,
    userId,
  };

  const posted = new Set<ServiceWorker>();
  const postToWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker || posted.has(worker)) return;
    posted.add(worker);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(message);
  };

  const postToController = () => postToWorker(navigator.serviceWorker.controller);

  postToController();
  // Only wait for a future controller if there isn't one yet — repeated calls
  // (e.g. the 10-minute heartbeat) would otherwise accumulate { once: true }
  // listeners that never fire when a controller is already active.
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', postToController, { once: true });
  }
  navigator.serviceWorker.ready
    .then((registration) => {
      postToWorker(registration.active);
      postToWorker(registration.waiting);
      postToWorker(registration.installing);
    })
    .catch(() => undefined);
}
