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

test.describe('emoji polish smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApp(page, { hashRouter: false });
  });

  test('keeps emoji picker labels clear of the emoji rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/__smoke/mobile-shell/emoji-polish');

    const recentLabel = page.getByText('RECENT');
    const recentFirstEmoji = page.locator('[data-group-id="recent"] button').first();
    const peopleLabel = page.getByText('SMILEYS & PEOPLE');
    const peopleFirstEmoji = page.locator('[data-group-id="People"] button').first();

    await expect(recentLabel).toBeVisible();
    await expect(recentFirstEmoji).toBeVisible();
    await expect(peopleLabel).toBeVisible();
    await expect(peopleFirstEmoji).toBeVisible();

    const recentLabelBox = await recentLabel.boundingBox();
    const recentFirstEmojiBox = await recentFirstEmoji.boundingBox();
    const peopleLabelBox = await peopleLabel.boundingBox();
    const peopleFirstEmojiBox = await peopleFirstEmoji.boundingBox();

    expect(recentLabelBox).not.toBeNull();
    expect(recentFirstEmojiBox).not.toBeNull();
    expect(peopleLabelBox).not.toBeNull();
    expect(peopleFirstEmojiBox).not.toBeNull();

    expect(recentFirstEmojiBox!.y - (recentLabelBox!.y + recentLabelBox!.height)).toBeGreaterThan(
      8
    );
    expect(peopleFirstEmojiBox!.y - (peopleLabelBox!.y + peopleLabelBox!.height)).toBeGreaterThan(
      8
    );

    await captureSnapshot(page, 'emoji-polish/desktop-picker-spacing');
  });

  test('keeps the picker inside a mobile viewport gutter', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__smoke/mobile-shell/emoji-polish');

    const picker = page.getByTestId('smoke-emoji-picker');
    await expect(picker).toBeVisible();

    const pickerBox = await picker.boundingBox();
    expect(pickerBox).not.toBeNull();

    expect(pickerBox!.x).toBeGreaterThanOrEqual(12);
    expect(390 - (pickerBox!.x + pickerBox!.width)).toBeGreaterThanOrEqual(12);

    await captureSnapshot(page, 'emoji-polish/mobile-picker-gutter');
  });
});
