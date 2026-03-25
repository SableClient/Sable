export function pushSessionToSW(baseUrl?: string, accessToken?: string, userId?: string) {
  if (!('serviceWorker' in navigator)) return;
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'setSession',
    accessToken,
    baseUrl,
    userId,
  });
}
