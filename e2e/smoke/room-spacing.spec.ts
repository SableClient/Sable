import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installSmokeApp, seedStoredSession } from './smokeApp';

const snapshotOutputDir = process.env.PLAYWRIGHT_SNAPSHOT_OUTPUT_DIR;

const captureSnapshot = async (page: Page, name: string) => {
  if (!snapshotOutputDir) return;

  const outputPath = path.join(snapshotOutputDir, `${name}.png`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
};

test.describe('room spacing smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApp(page, { authenticatedSession: true, hashRouter: false });
    await seedStoredSession(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test('keeps the last event clear of the typing/composer stack and preserves a drawer gutter', async ({
    page,
  }) => {
    await page.goto('/__smoke/mobile-shell/room-spacing');

    const lastEvent = page.getByTestId('smoke-last-event');
    const typingIndicator = page.getByTestId('smoke-typing-indicator');
    const drawerDivider = page.getByTestId('smoke-drawer-divider');

    await expect(lastEvent).toBeVisible();
    await expect(typingIndicator).toBeVisible();
    await expect(drawerDivider).toBeVisible();

    const lastEventBox = await lastEvent.boundingBox();
    const typingIndicatorBox = await typingIndicator.boundingBox();
    const drawerDividerBox = await drawerDivider.boundingBox();

    expect(lastEventBox).not.toBeNull();
    expect(typingIndicatorBox).not.toBeNull();
    expect(drawerDividerBox).not.toBeNull();

    expect(typingIndicatorBox!.y - (lastEventBox!.y + lastEventBox!.height)).toBeGreaterThanOrEqual(
      20
    );
    expect(drawerDividerBox!.x - (lastEventBox!.x + lastEventBox!.width)).toBeGreaterThanOrEqual(
      16
    );

    await captureSnapshot(page, 'room-spacing/drawer-and-footer-gutters');
  });
});
