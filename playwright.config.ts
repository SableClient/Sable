import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  workers: 4,
  // Locally a failure should surface at once; CI keeps retries for flakes.
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  // Tests run in 3-6s against a built app; this is headroom, not a wait budget.
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: 'http://127.0.0.1:4175',
    storageState: 'tests/e2e/.auth/state-4175.json',
    trace: 'on-first-retry',
    // Sheets skip their entrance animation here, so a click cannot land mid-slide.
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      teardown: 'teardown',
      retries: 0,
    },
    {
      name: 'teardown',
      testMatch: /global\.teardown\.ts/,
    },
    // touch.spec.ts drives page.touchscreen, which throws unless hasTouch is set.
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /touch\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: /touch\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    // hasTouch + isMobile: covers long-press, swipe-to-dismiss and tap targets,
    // which the `mobile` project (a viewport-narrowed desktop) cannot reach.
    {
      name: 'touch',
      dependencies: ['setup'],
      testMatch: ['**/touch.spec.ts', '**/permalink-jump.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // Test the production build.
    command: 'pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NODE_OPTIONS: '--max-old-space-size=8192' },
  },
});
