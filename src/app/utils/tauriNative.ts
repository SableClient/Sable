import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

const KEYBOARD_HEIGHT = '--keyboard-height';
const DESKTOP_OS = new Set(['linux', 'macos', 'windows']);
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], [contenteditable=""]';

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

// Suppress the webview's own context menu except on editable fields, where the
// native paste/spellcheck menu is expected.
function installDesktopContextMenuSuppression(): () => void {
  const onContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(EDITABLE_SELECTOR)) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', onContextMenu);
  return () => document.removeEventListener('contextmenu', onContextMenu);
}

export function installTauriNativeBehaviors(): void {
  if (!isTauri()) return;

  const os = osType();
  if (os === 'ios') installIosKeyboardInset();
  if (DESKTOP_OS.has(os)) installDesktopContextMenuSuppression();
}
