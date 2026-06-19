import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { installSmokeApp, seedSentryPreference, seedSettings, seedStoredSession } from './smokeApp';

const snapshotOutputDir = process.env.PLAYWRIGHT_SNAPSHOT_OUTPUT_DIR;
const sentryConfigured = Boolean(process.env.VITE_SENTRY_DSN);
const toolbarEnabled = process.env.VITE_SENTRY_TOOLBAR === 'true';
const isCI = Boolean(process.env.CI);

const assertSentryConfigured = () => {
  if (sentryConfigured) return;
  if (isCI) {
    throw new Error('VITE_SENTRY_DSN must be set in CI to exercise preview-only Sentry flows.');
  }
  test.skip(true, 'VITE_SENTRY_DSN must be set to exercise preview-only Sentry flows');
};

const stubToolbar = async (page: Page) => {
  if (!toolbarEnabled) return;
  await page.addInitScript(() => {
    window.SentryToolbar = {
      init() {
        return undefined;
      },
    };
  });
};

const captureSnapshot = async (page: Page, name: string) => {
  if (!snapshotOutputDir) return;

  const outputPath = path.join(snapshotOutputDir, `${name}.png`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
};

test.describe('observability smoke', () => {
  test('shows the telemetry consent banner for authenticated preview sessions', async ({
    page,
  }) => {
    assertSentryConfigured();
    await stubToolbar(page);
    await installSmokeApp(page, { authenticatedSession: true });
    await seedStoredSession(page);

    await page.goto('/');

    await expect(page.getByRole('region', { name: /crash reporting prompt/i })).toBeVisible();
    await captureSnapshot(page, 'authenticated-home/telemetry-consent-banner');

    await page.getByRole('button', { name: /no thanks/i }).click();

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('sable_sentry_enabled')))
      .toBe('false');
  });

  test('persists diagnostics toggles and exposes the preview toolbar build signal', async ({
    page,
  }) => {
    assertSentryConfigured();
    await stubToolbar(page);
    await installSmokeApp(page, { authenticatedSession: true });
    await seedStoredSession(page);
    await seedSentryPreference(page, false);
    await seedSettings(page, { developerTools: true });

    await page.goto('/#/settings/general');

    const errorReportingTile = page.locator('[data-settings-focus="error-reporting"]');
    await expect(errorReportingTile).toBeVisible();
    await captureSnapshot(page, 'settings/general-diagnostics');

    await errorReportingTile.getByRole('switch').click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('sable_sentry_enabled')))
      .toBe('true');

    const sessionReplayTile = page.locator('[data-settings-focus="session-replay"]');
    await expect(sessionReplayTile).toBeVisible();
    await sessionReplayTile.getByRole('switch').click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('sable_sentry_replay_enabled')))
      .toBe('true');

    await page.goto('/#/settings/developer-tools');

    const toolbarTile = page.locator('[data-settings-focus="toolbar-preview"]');
    await expect(toolbarTile).toBeVisible();
    await expect(toolbarTile).toContainText(
      toolbarEnabled ? 'enabled for this build' : 'disabled for this build'
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute('data-sentry-toolbar-state'))
      )
      .toBe(toolbarEnabled ? 'enabled' : 'disabled');

    await captureSnapshot(page, 'settings/developer-tools-sentry');
  });
});
