import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { type as osType } from '@tauri-apps/plugin-os';
import { isKeyHotkey } from 'is-hotkey';

const DESKTOP_OS = new Set(['linux', 'macos', 'windows']);
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], [contenteditable=""]';
const BLOCKED_CEF_DESKTOP_SHORTCUTS = [
  'f3',
  'f7',
  'ctrl+shift+g',
  'ctrl+j',
  'ctrl+g',
  'f5',
  'ctrl+f5',
  'shift+f5',
  'ctrl+r',
  'ctrl+shift+r',
  'ctrl+u',
  'ctrl+o',
  'ctrl+p',
  'ctrl+shift+p',
] as const;

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

function installDesktopCefShortcutSuppression(): void {
  window.addEventListener('keydown', (event) => {
    if (isKeyHotkey(BLOCKED_CEF_DESKTOP_SHORTCUTS, event)) event.preventDefault();
  });
}

function installDesktopCefMiddleClickOpener(): void {
  document.addEventListener('auxclick', (event) => {
    if (event.button !== 1 || event.defaultPrevented) return;
    const anchor = event.composedPath().find((target) => target instanceof HTMLAnchorElement);
    if (!anchor || !['http:', 'https:', 'mailto:', 'tel:'].includes(anchor.protocol)) return;

    event.preventDefault();
    void openUrl(anchor.href).catch(() => undefined);
  });
}

export function installTauriNativeBehaviors(): void {
  if (!isTauri()) return;

  const os = osType();
  if (DESKTOP_OS.has(os)) installDesktopContextMenuSuppression();
  if (os === 'linux') {
    installDesktopCefMiddleClickOpener();
    installDesktopCefShortcutSuppression();
  }
}
