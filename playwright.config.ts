import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const traceMode = process.env.PLAYWRIGHT_TRACE === 'off' ? 'off' : 'on-first-retry';
const shellQuote = (value: string | undefined): string =>
  `'${(value ?? '').split("'").join("'\"'\"'")}'`;
const forwardedEnv = [
  'VITE_SENTRY_DSN',
  'VITE_SENTRY_ENVIRONMENT',
  'VITE_SENTRY_PR',
  'VITE_SENTRY_TOOLBAR',
  'VITE_SENTRY_TOOLBAR_ORIGIN',
  'VITE_SENTRY_TOOLBAR_DEBUG',
  'VITE_SENTRY_ORGANIZATION',
  'VITE_SENTRY_PROJECT',
]
  .map((key) => `${key}=${shellQuote(process.env[key])}`)
  .join(' ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: traceMode,
  },
  webServer: {
    command: `${forwardedEnv} pnpm vite --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
