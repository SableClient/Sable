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

// 100vh is the only unit that includes the safe-area insets in installed PWAs; probe it so we
// never depend on window.innerHeight, which iOS shrinks on the first keyboard open.
function measureFullHeight(): number {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.top = '0';
  probe.style.left = '0';
  probe.style.height = '100vh';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.documentElement.appendChild(probe);
  const height = probe.offsetHeight;
  probe.remove();
  return height;
}

export function installIosPwaViewportHeight(): void {
  if (!isStandaloneIosPwa()) return;

  let frame = 0;
  let settleTimer = 0;
  let fullHeight = measureFullHeight();
  let viewportWidth = window.innerWidth;

  const updateHeight = () => {
    frame = 0;

    // Re-probe after rotation.
    if (window.innerWidth !== viewportWidth) {
      viewportWidth = window.innerWidth;
      fullHeight = measureFullHeight();
    }

    const viewport = window.visualViewport;
    // Reach the bottom of the visible area. window.innerHeight is unusable here: iOS shrinks it
    // on the first keyboard open and never restores it until the app is force-quit.
    const visibleBottom = viewport ? viewport.height + viewport.offsetTop : fullHeight;

    // Only shrink above the keyboard; idle visualViewport heights under-report by the insets.
    const keyboardOpen = isEditableFocused() && fullHeight - visibleBottom > MIN_KEYBOARD_HEIGHT;

    document.documentElement.style.setProperty(
      IOS_PWA_VIEWPORT_HEIGHT,
      `${Math.round(keyboardOpen ? visibleBottom : fullHeight)}px`
    );
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
