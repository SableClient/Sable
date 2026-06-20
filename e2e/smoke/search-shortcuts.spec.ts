import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { installSmokeApp, seedStoredSession } from './smokeApp';

const triggerShortcut = async (page: Page, key: string) => {
  await page.evaluate((pressedKey) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: pressedKey,
        ctrlKey: true,
        bubbles: true,
      })
    );
  }, key);
};

test.describe('search shortcut smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApp(page, { authenticatedSession: true, hashRouter: false });
    await seedStoredSession(page);
    await page.goto('/__smoke/mobile-shell/search-shortcuts');
  });

  test('routes ctrl/cmd+f into context message search and keeps ctrl/cmd+k on the picker', async ({
    page,
  }) => {
    await expect(page.getByTestId('smoke-search-context')).toHaveText('Home room');

    await triggerShortcut(page, 'f');
    await expect(page.getByTestId('smoke-search-result')).toHaveText(
      '/home/search/?rooms=%21room%3Asmoke.test'
    );
    await expect(page.getByTestId('smoke-room-picker-state')).toHaveText('Room picker closed');

    await triggerShortcut(page, 'k');
    await expect(page.getByTestId('smoke-search-result')).toHaveText('Opened room picker');
    await expect(page.getByTestId('smoke-room-picker-state')).toHaveText('Room picker open');

    await page.getByRole('button', { name: 'Space lobby' }).click();
    await triggerShortcut(page, 'f');
    await expect(page.getByTestId('smoke-search-result')).toHaveText('/!space%3Asmoke.test/search');
    await expect(page.getByTestId('smoke-room-picker-state')).toHaveText('Room picker closed');
  });
});
