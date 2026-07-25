import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  // Every context shares one Matrix account and device id from the seeded
  // storageState, so concurrent clients contend over sync and crypto state.
  // Parallelising would need a worker-scoped account fixture; the suite runs in
  // well under a minute serially, so it is not worth the plumbing.
  fullyParallel: false,
  workers: 1,
  // Locally a failure should surface at once; CI keeps retries for flakes.
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  // Tests run in 3-6s against a built app; this is headroom, not a wait budget.
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: 'http://localhost:8081',
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // A real build, not the dev server: no HMR and no dependency optimiser, both
    // of which invalidate the module graph mid-run and make the suite lie.
    // Port 8081, not the dev server's 8080, so a running `pnpm dev` is untouched.
    command: 'pnpm run build && pnpm exec vite preview --port 8081 --strictPort',
    url: 'http://localhost:8081',
    // Never reuse: a leftover server would silently serve a stale build. The
    // build is ~30s, which is worth paying to know what is under test.
    reuseExistingServer: false,
    // ~35s observed (31s build + preview start), with headroom for a cold CI box.
    timeout: 180_000,
    env: { NODE_OPTIONS: '--max-old-space-size=8192' },
  },
});
