const IOS_PWA_VIEWPORT_HEIGHT = '--sable-ios-pwa-viewport-height';
const MIN_KEYBOARD_HEIGHT = 100;

const isStandaloneIosPwa = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches &&
  CSS.supports('-webkit-touch-callout: none');

const isEditableFocused = (): boolean => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
};

const fullScreenHeight = (): number => {
  const { width, height } = window.screen;
  return window.matchMedia('(orientation: portrait)').matches
    ? Math.max(width, height)
    : Math.min(width, height);
};

export function installIosPwaViewportHeight(): void {
  if (!isStandaloneIosPwa()) return;

  let frame = 0;
  let settleTimer = 0;

  const updateHeight = () => {
    frame = 0;
    const viewport = window.visualViewport;
    const visibleHeight = viewport?.height ?? window.innerHeight;
    const visibleBottom = visibleHeight + (viewport?.offsetTop ?? 0);

    const screenHeight = fullScreenHeight();
    const keyboardOpen = isEditableFocused() && screenHeight - visibleHeight > MIN_KEYBOARD_HEIGHT;
    const height = keyboardOpen ? visibleBottom : screenHeight;

    document.documentElement.style.setProperty(IOS_PWA_VIEWPORT_HEIGHT, `${Math.round(height)}px`);
  };

  const scheduleUpdate = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateHeight);

    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(updateHeight, 350);
  };

  updateHeight();
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('orientationchange', scheduleUpdate);
  window.visualViewport?.addEventListener('resize', scheduleUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleUpdate);
  document.addEventListener('focusin', scheduleUpdate);
  document.addEventListener('focusout', scheduleUpdate);
}
