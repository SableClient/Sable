import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('General').first()).toBeVisible({ timeout: 180_000 });
  await page
    .getByRole('button', { name: 'Dismiss' })
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

test.describe('create room surface', () => {
  test('desktop opens it over the page it was launched from', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');
    await openApp(page);

    await page.getByRole('button', { name: 'Create Room' }).first().click();

    await expect(page).toHaveURL(/\/create-room$/);
    await expect(page.getByText('New Room')).toBeVisible();
    // The room list stays mounted behind the overlay.
    await expect(page.getByText('General').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.getByText('New Room')).toBeHidden();
  });

  test('mobile opens it as a full page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile');
    await openApp(page);

    await page.goto('/create-room');

    await expect(page.getByText('New Room').first()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole('button', { name: 'Close create room' })).toBeVisible();
    await expect(page.getByText('General')).toBeHidden();
  });

  test('deep linking on desktop renders the full page, not an overlay', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');
    await openApp(page);

    await page.goto('/create-room?type=voice');

    await expect(page.getByText('New Room').first()).toBeVisible({ timeout: 180_000 });
    // A desktop deep link is a full page with the desktop sidebar, so it has
    // no mobile-only close button.
    await expect(page.getByText('General').first()).toBeHidden();
    await expect(page.getByRole('button', { name: /Voice Room/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

test('browser back closes a surface opened over a page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await openApp(page);

  await page.getByRole('button', { name: 'Create Room' }).first().click();
  await expect(page).toHaveURL(/\/create-room$/);

  await page.goBack();

  await expect(page).toHaveURL(/\/home\/?$/);
  await expect(page.getByText('New Room')).toBeHidden();
});
