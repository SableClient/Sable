import { defineConfig } from '@playwright/test';

// Drives a Tauri Android debug APK's WebView over CDP. The app must already
// be installed, launched, and its CDP port forwarded via adb — see
// scripts/e2e-android.sh.
export default defineConfig({
  testDir: './tests/e2e-android',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
  },
});
