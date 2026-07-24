import { test, expect, type Page } from '@playwright/test';

async function dismissDeviceBanner(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Dismiss' })
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

test('leave room prompt opens from the room options menu', async ({ page }) => {
  await page.goto('/');
  const room = page.getByText('General').first();
  await expect(room).toBeVisible({ timeout: 180_000 });
  await dismissDeviceBanner(page);

  await room.hover();
  await page.getByRole('button', { name: 'More Options' }).first().click();
  // The mobile sheet can overflow the viewport, where a real pointer click fails.
  await page.getByRole('button', { name: 'Leave Room' }).dispatchEvent('click');

  await expect(page.getByText('Are you sure you want to leave this room?')).toBeVisible();
});
