import { defineConfig } from '@playwright/test';

// Drives a Tauri Android debug APK's WebView over CDP.
// Unlike the web e2e config, this does NOT build or serve anything —
// the app must already be installed, launched, and its CDP port forwarded
// via adb. See scripts/e2e-android.sh.
export default defineConfig({
  testDir: './tests/e2e-android',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    // connectOverCDP is called per-test; no baseURL or storageState needed.
    trace: 'on-first-retry',
  },
});
