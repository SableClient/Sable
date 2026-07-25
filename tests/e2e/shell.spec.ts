import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

const containerised = Boolean(process.env.PW_TEST_CONNECT_WS_ENDPOINT);

const maskDynamic = (page: Page) => ({
  mask: [page.locator('time'), page.getByText(/^Created by /)],
});

test.describe('app shell', () => {
  test('shows seeded rooms after login', async ({ app }) => {
    await expect(app.room('General')).toBeVisible();
    await expect(app.room('Random')).toBeVisible();
  });

  test('opens a room and renders its timeline', async ({ app, page }) => {
    await app.room('General').click();

    await expect(page.getByText('Welcome to the test room.')).toBeVisible();
    await expect(page.getByText('Layout baseline seed message.')).toBeVisible();
  });

  // `app` is requested so the fixture loads the shell before the snapshot.
  test('matches the shell layout baseline', async ({ app, page }, testInfo) => {
    test.skip(!containerised, 'run via pnpm test:e2e:docker');
    test.skip(testInfo.project.name === 'touch', 'desktop and mobile cover layout');
    await expect(app.room('General')).toBeVisible();

    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot('shell.png', maskDynamic(page));
  });
});
