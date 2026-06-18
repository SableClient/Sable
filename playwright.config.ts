import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const traceMode = process.env.PLAYWRIGHT_TRACE === 'off' ? 'off' : 'on-first-retry';

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
    command: `pnpm vite --host 127.0.0.1 --port ${port}`,
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
