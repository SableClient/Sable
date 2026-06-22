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

    expect(
      recentFirstEmojiBox!.y - (recentLabelBox!.y + recentLabelBox!.height)
    ).toBeGreaterThanOrEqual(8);
    expect(
      peopleFirstEmojiBox!.y - (peopleLabelBox!.y + peopleLabelBox!.height)
    ).toBeGreaterThanOrEqual(8);

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

  test('matches picker icon scale, keeps stickers separated, and aligns inline emoji', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/__smoke/mobile-shell/emoji-polish');

    await expect(page.getByTestId('smoke-standard-emoji-button')).toBeVisible();
    await expect(page.getByTestId('smoke-pack-icon-reference')).toBeVisible();
    await expect(page.getByTestId('smoke-sticker-a')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const measure = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
          centerY: rect.top + rect.height / 2,
        };
      };

      const firstSticker = measure('[data-testid="smoke-sticker-a"]');
      const secondSticker = measure('[data-testid="smoke-sticker-b"]');
      const thirdSticker = measure('[data-testid="smoke-sticker-c"]');

      return {
        pickerButton: measure('[data-testid="smoke-standard-emoji-button"]'),
        pickerGlyph: measure('[data-testid="smoke-standard-emoji-glyph"]'),
        packIcon: measure('[data-testid="smoke-pack-icon-reference"] img'),
        stickerButton: measure('[data-testid="smoke-sticker-a"]'),
        stickerImage: measure('[data-testid="smoke-sticker-a"] img'),
        firstSticker,
        secondSticker,
        thirdSticker,
        baselineLine: measure('[data-testid="smoke-emoji-baseline-line"]'),
        baselineText: measure('[data-testid="smoke-emoji-baseline-text"]'),
        baselineEmoji: measure('[data-testid="smoke-emoji-baseline-line"] span[title]'),
        compactPreview: measure('[data-testid="smoke-compact-preview-line"]'),
        compactPreviewEmoji: measure('[data-testid="smoke-compact-preview-block"] span[title]'),
        fixedCellBlackSquareFontFamily: getComputedStyle(
          document.querySelector(
            '[data-testid="smoke-emoji-fixed-cell-line"] span[title="black_large_square"]'
          )!
        ).fontFamily,
      };
    });

    expect(metrics.pickerButton).not.toBeNull();
    expect(metrics.pickerGlyph).not.toBeNull();
    expect(metrics.packIcon).not.toBeNull();
    expect(metrics.stickerButton).not.toBeNull();
    expect(metrics.stickerImage).not.toBeNull();
    expect(metrics.firstSticker).not.toBeNull();
    expect(metrics.secondSticker).not.toBeNull();
    expect(metrics.thirdSticker).not.toBeNull();
    expect(metrics.baselineLine).not.toBeNull();
    expect(metrics.baselineText).not.toBeNull();
    expect(metrics.baselineEmoji).not.toBeNull();
    expect(metrics.compactPreview).not.toBeNull();
    expect(metrics.compactPreviewEmoji).not.toBeNull();
    expect(metrics.fixedCellBlackSquareFontFamily).toContain('Twemoji');

    expect(metrics.pickerButton!.width).toBe(48);
    expect(metrics.pickerButton!.height).toBe(48);
    expect(metrics.pickerGlyph!.width).toBe(32);
    expect(metrics.pickerGlyph!.height).toBe(32);
    expect(metrics.packIcon!.width).toBe(32);
    expect(metrics.packIcon!.height).toBe(32);
    expect(metrics.stickerButton!.width).toBe(112);
    expect(metrics.stickerButton!.height).toBe(112);
    expect(metrics.stickerImage!.width).toBe(96);
    expect(metrics.stickerImage!.height).toBe(96);
    expect(metrics.secondSticker!.left - metrics.firstSticker!.right).toBeGreaterThanOrEqual(4);
    expect(metrics.thirdSticker!.left - metrics.secondSticker!.right).toBeGreaterThanOrEqual(4);
    expect(metrics.baselineEmoji!.top).toBeGreaterThanOrEqual(metrics.baselineLine!.top - 6);
    expect(metrics.baselineEmoji!.bottom).toBeLessThanOrEqual(metrics.baselineLine!.bottom + 2);
    expect(Math.abs(metrics.baselineEmoji!.centerY - metrics.baselineText!.centerY)).toBeLessThan(
      4
    );
    expect(metrics.compactPreviewEmoji!.top).toBeGreaterThanOrEqual(
      metrics.compactPreview!.top - 4
    );
    expect(metrics.compactPreviewEmoji!.bottom).toBeLessThanOrEqual(
      metrics.compactPreview!.bottom + 2
    );

    await captureSnapshot(page, 'emoji-polish/sticker-fit-and-baseline');
  });
});
