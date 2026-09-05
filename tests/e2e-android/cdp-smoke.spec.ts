import { test, expect, chromium } from '@playwright/test';

test('android webview is reachable over CDP and renders the app shell', async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  expect(page.url()).toContain('tauri.localhost');
  await expect(page.locator('#root')).toBeAttached({ timeout: 15_000 });

  await browser.close();
});
