import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';
import { installSmokeApp, seedStoredSession } from './smokeApp';

const snapshotOutputDir = process.env.PLAYWRIGHT_SNAPSHOT_OUTPUT_DIR;

const captureSnapshot = async (page: Page, name: string) => {
  if (!snapshotOutputDir) return;

  const outputPath = path.join(snapshotOutputDir, `${name}.png`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
};

test.use({
  ...devices['iPhone 13'],
  browserName: 'chromium',
});

test.describe('mobile shell layout harness smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApp(page, { authenticatedSession: true, hashRouter: false });
    await seedStoredSession(page);
  });

  test('captures home list safe-area spacing in the layout harness', async ({ page }) => {
    await page.goto('/__smoke/mobile-shell/home');
    await expect(page.getByText('Last item above safe area')).toBeVisible();
    await captureSnapshot(page, 'layout-harness/mobile-shell/home-safe-area');
  });

  test('captures room footer safe-area spacing in the layout harness', async ({ page }) => {
    await page.goto('/__smoke/mobile-shell/room');
    await expect(page.getByText('Following the conversation')).toBeVisible();
    await captureSnapshot(page, 'layout-harness/mobile-shell/room-footer-safe-area');
  });

  test('captures full-screen room settings presentation in the layout harness', async ({
    page,
  }) => {
    await page.goto('/__smoke/mobile-shell/settings');
    await expect(page.getByText('Room Settings')).toBeVisible();
    await expect(page.getByText('Members')).toBeVisible();
    await captureSnapshot(page, 'layout-harness/mobile-shell/room-settings-fullscreen');
  });

  test('captures full-screen member profile presentation in the layout harness', async ({
    page,
  }) => {
    await page.goto('/__smoke/mobile-shell/profile');
    await expect(page.getByText('Member Profile')).toBeVisible();
    await expect(page.getByText('Profile detail block 6')).toBeVisible();
    await captureSnapshot(page, 'layout-harness/mobile-shell/member-profile-fullscreen');
  });

  test('captures the Emoji QA alignment reference fixture in the layout harness', async ({
    page,
  }) => {
    await page.goto('/__smoke/mobile-shell/emoji-qa');
    await expect(page.getByTestId('emoji-qa-membership-copy')).toBeVisible();
    await expect(page.getByTestId('emoji-qa-monkey')).toBeVisible();
    await expect(page.getByTestId('emoji-qa-heart')).toBeVisible();
    await captureSnapshot(page, 'layout-harness/mobile-shell/emoji-qa-reference-room');
  });
});
