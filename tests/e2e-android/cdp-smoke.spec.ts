import { test, expect, chromium } from '@playwright/test';

// Proof-of-concept: drive the Tauri Android app's WebView over CDP.
// Prerequisites (run before `playwright test`):
//   1. Debug APK installed + launched on a device/emulator
//   2. adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
// See scripts/e2e-android.sh for the full orchestration.

test('android webview is reachable over CDP and renders the app shell', async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  // The Tauri app serves over https://tauri.localhost
  expect(page.url()).toContain('tauri.localhost');

  // The app shell mounts a root container once React is ready.
  await expect(page.locator('#root')).toBeAttached({ timeout: 15_000 });

  await browser.close();
});
