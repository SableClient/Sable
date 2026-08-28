// Tauri adds a nonce to style-src, which makes strict CSP engines (Android WebView)
// drop runtime-injected <style> that lack it. Reuse the nonce Tauri already stamped.
let cachedNonce: string | undefined;

export function getCspNonce(): string {
  if (cachedNonce !== undefined) return cachedNonce;
  const stamped = document.querySelector<HTMLElement>('style[nonce], script[nonce]');
  cachedNonce = stamped?.nonce ?? '';
  return cachedNonce;
}

export function applyCspNonce(el: HTMLElement): void {
  const nonce = getCspNonce();
  if (nonce) el.setAttribute('nonce', nonce);
}
