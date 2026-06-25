import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installSmokeApp } from './smokeApp';

const snapshotOutputDir = process.env.PLAYWRIGHT_SNAPSHOT_OUTPUT_DIR;

const captureSnapshot = async (page: Page, name: string) => {
  if (!snapshotOutputDir) return;

  const outputPath = path.join(snapshotOutputDir, `${name}.png`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
};

test.describe('menu polish fixture smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApp(page, { hashRouter: false });
  });

  test('keeps selector menus and account sections visually grouped', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/__smoke/mobile-shell/menu-polish');

    await page.getByRole('button', { name: 'Default' }).click();
    const defaultOption = page.getByRole('button', {
      name: 'Default Follows your global notification rules',
    });
    await expect(defaultOption).toBeVisible();

    const metrics = await page.evaluate(() => {
      const selectorOptions = Array.from(document.querySelectorAll('button')).filter((button) =>
        ['Default', 'All Messages', 'Mute'].some((label) => button.textContent?.includes(label))
      );
      const selectorOption = selectorOptions.find((button) =>
        button.textContent?.includes('Follows your global notification rules')
      );
      const selectorOptionGroup = selectorOption?.parentElement;
      const selectorMenuSurface = selectorOptionGroup?.parentElement;
      const accountMenu = document.querySelector('[data-testid="smoke-account-menu"]');
      const featuresLink = document.querySelector('[data-testid="smoke-features-link"]');
      const accountButtons = accountMenu?.querySelectorAll('button') ?? [];
      const selectorMenuSurfaceStyle = selectorMenuSurface
        ? getComputedStyle(selectorMenuSurface)
        : undefined;

      return {
        selectorOptionCount: selectorOptions.length,
        hasSelectorOption: !!selectorOption,
        selectorMenuSurfaceBackground: selectorMenuSurfaceStyle?.backgroundColor,
        accountButtonCount: accountButtons.length,
        featuresHref: featuresLink?.getAttribute('href'),
      };
    });

    expect(metrics.selectorOptionCount).toBeGreaterThanOrEqual(3);
    expect(metrics.hasSelectorOption).toBe(true);
    expect(metrics.selectorMenuSurfaceBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(metrics.accountButtonCount).toBeGreaterThanOrEqual(4);
    expect(metrics.featuresHref).toBe('https://github.com/CloudHub-Social/Charm/releases');

    await captureSnapshot(page, 'layout-harness/menu-polish/menu-groups-and-links');
  });
});
