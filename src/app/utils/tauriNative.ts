import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

const KEYBOARD_HEIGHT = '--keyboard-height';

function installIosKeyboardInset(): () => void {
  let frame = 0;

  const update = () => {
    frame = 0;
    const viewport = window.visualViewport;
    const height = viewport ? window.innerHeight - viewport.height - viewport.offsetTop : 0;
    document.documentElement.style.setProperty(
      KEYBOARD_HEIGHT,
      `${Math.max(0, Math.round(height))}px`
    );
  };

  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };

  update();
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('orientationchange', schedule);
  };
}

export function installTauriNativeBehaviors(): void {
  if (!isTauri()) return;

  const os = osType();
  if (os === 'ios') installIosKeyboardInset();
}
