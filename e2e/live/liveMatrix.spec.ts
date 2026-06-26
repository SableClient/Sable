import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const server = process.env.LIVE_MATRIX_SERVER;
const username = process.env.LIVE_MATRIX_USERNAME;
const password = process.env.LIVE_MATRIX_PASSWORD;
const roomId = process.env.LIVE_MATRIX_ROOM_ID;
const snapshotOutputDir = process.env.PLAYWRIGHT_SNAPSHOT_OUTPUT_DIR;
const emojiQaRoomId = process.env.LIVE_MATRIX_EMOJI_QA_ROOM_ID;
const sentryDsn = process.env.VITE_SENTRY_DSN;
const LIVE_TEST_TIMEOUT_MS = 90_000;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const requireEnv = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`${name} must be set`);
  return value;
};

const captureSnapshot = async (page: Page, name: string) => {
  if (!snapshotOutputDir) return;

  const outputPath = path.join(snapshotOutputDir, `${name}.png`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
};

const expectStoredSession = async (page: Page) => {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const rawSessions = localStorage.getItem('matrixSessions');
          if (!rawSessions) return 0;

          try {
            const sessions = JSON.parse(rawSessions);
            return Array.isArray(sessions) ? sessions.length : 0;
          } catch {
            return 0;
          }
        }),
      { timeout: 60_000 }
    )
    .not.toBe(0);
};

const loginToLiveMatrix = async (page: Page) => {
  const liveServer = requireEnv(server, 'LIVE_MATRIX_SERVER');
  const liveUsername = requireEnv(username, 'LIVE_MATRIX_USERNAME');
  const livePassword = requireEnv(password, 'LIVE_MATRIX_PASSWORD');

  await page.goto(`/login/${encodeURIComponent(liveServer)}`);

  await expect(page.locator('input').first()).toHaveValue(liveServer);
  await expect(page.locator('#login-username-input')).toBeVisible();
  await expect(page.locator('#login-password-input')).toBeVisible();

  await page.locator('#login-username-input').fill(liveUsername);
  await page.locator('#login-password-input').fill(livePassword);
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await expect(page).toHaveURL(/\/home\/?$/, { timeout: 60_000 });
  await expectStoredSession(page);
};

const logoutAndClearSession = async (page: Page) => {
  await page.evaluate(async () => {
    const rawSessions = localStorage.getItem('matrixSessions');
    if (!rawSessions) return;

    try {
      const sessions = JSON.parse(rawSessions);
      const activeUserId = localStorage.getItem('matrixActiveSession');
      const session = Array.isArray(sessions)
        ? (sessions.find((candidate) => candidate?.userId === activeUserId) ?? sessions[0])
        : undefined;

      if (session?.baseUrl && session?.accessToken) {
        await fetch(`${session.baseUrl}/_matrix/client/v3/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        }).catch(() => undefined);
      }
    } catch {
      // Ignore cleanup failures so the suite reports the real assertion result.
    } finally {
      localStorage.removeItem('matrixSessions');
      localStorage.removeItem('matrixActiveSession');
    }
  });
};

const enableDeveloperTools = async (page: Page) => {
  await page.goto('/settings/developer-tools');

  const toggle = page.locator('[data-settings-focus="enable-developer-tools"]').getByRole('switch');

  await expect(toggle).toBeVisible({ timeout: 60_000 });

  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
};

const openLiveRoom = async (page: Page, targetRoomId: string) => {
  const encodedRoomId = encodeURIComponent(targetRoomId);
  await page.goto(`/home/${encodedRoomId}`);

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
    .toMatch(new RegExp(`/home/${escapeRegExp(encodedRoomId)}/?$`));
};

test.describe.serial('live matrix authenticated smoke', () => {
  test.describe.configure({ retries: 0, timeout: LIVE_TEST_TIMEOUT_MS });

  test.skip(
    !server || !username || !password,
    'LIVE_MATRIX_SERVER, LIVE_MATRIX_USERNAME, and LIVE_MATRIX_PASSWORD must be set'
  );

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await loginToLiveMatrix(page);
  });

  test.afterAll(async () => {
    await logoutAndClearSession(page);
    await context.close();
  });

  test('lands on the logged-in home shell', async () => {
    await page.goto('/home');

    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.getByRole('link', { name: 'Source Code' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('Petting cats')).toBeHidden({
      timeout: 60_000,
    });
    await expectStoredSession(page);
  });

  test('opens a known room when LIVE_MATRIX_ROOM_ID is configured', async () => {
    test.skip(!roomId, 'LIVE_MATRIX_ROOM_ID must be set to validate room navigation');

    await openLiveRoom(page, requireEnv(roomId, 'LIVE_MATRIX_ROOM_ID'));
  });

  test('captures the Emoji QA alignment reference room', async () => {
    test.skip(
      !emojiQaRoomId,
      'LIVE_MATRIX_EMOJI_QA_ROOM_ID must be set to capture the Emoji QA alignment reference room'
    );

    await openLiveRoom(page, requireEnv(emojiQaRoomId, 'LIVE_MATRIX_EMOJI_QA_ROOM_ID'));

    await expect(page.getByText('joined the room')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('<3')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('🙉')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('❤️')).toBeVisible({ timeout: 60_000 });

    const metrics = await page.evaluate(() => {
      const pickSmallest = (needle: string) =>
        Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter((el) => el.textContent?.trim() === needle)
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .sort(
            (left, right) =>
              left.rect.width * left.rect.height - right.rect.width * right.rect.height
          )[0]?.el;

      const findEventRow = (el: HTMLElement | undefined) => {
        let current = el?.parentElement;
        while (current) {
          const hasSeparateBeforeSlot = current.childElementCount >= 2;
          const hasMembershipIcon = Boolean(current.querySelector('svg'));
          if (hasSeparateBeforeSlot && hasMembershipIcon) return current;
          current = current.parentElement;
        }
        return undefined;
      };

      const rect = (el: Element | null | undefined) => {
        if (!(el instanceof HTMLElement || el instanceof SVGElement)) return null;
        const box = el.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          right: box.right,
          bottom: box.bottom,
          centerY: box.y + box.height / 2,
        };
      };

      const joinedText = pickSmallest('joined the room');
      const joinedRow = findEventRow(joinedText);
      const joinedIcon = joinedRow?.querySelector('svg');
      const followupText = pickSmallest('<3');
      const jumboEmoji = pickSmallest('🙉');
      const heartEmoji = pickSmallest('❤️');
      const firstAvatarButton = Array.from(document.querySelectorAll<HTMLElement>('button')).find(
        (el) => el.dataset.userId && el.querySelector('img, svg')
      );
      const firstMessageHeader = Array.from(document.querySelectorAll<HTMLElement>('button')).find(
        (el) => el.dataset.userId && /test/i.test(el.textContent ?? '')
      );
      const jumboRow = jumboEmoji?.closest('div');
      const heartRow = heartEmoji?.closest('div');

      return {
        avatar: rect(firstAvatarButton),
        header: rect(firstMessageHeader),
        joinedIcon: rect(joinedIcon),
        followupText: rect(followupText),
        jumboRow: rect(jumboRow),
        jumboEmoji: rect(jumboEmoji),
        heartRow: rect(heartRow),
        heartEmoji: rect(heartEmoji),
      };
    });

    expect(metrics.avatar).not.toBeNull();
    expect(metrics.header).not.toBeNull();
    expect(metrics.joinedIcon).not.toBeNull();
    expect(metrics.followupText).not.toBeNull();
    expect(metrics.jumboRow).not.toBeNull();
    expect(metrics.jumboEmoji).not.toBeNull();
    expect(metrics.heartRow).not.toBeNull();
    expect(metrics.heartEmoji).not.toBeNull();

    expect(Math.abs(metrics.joinedIcon!.x - metrics.avatar!.x)).toBeLessThanOrEqual(12);
    expect(Math.abs(metrics.followupText!.x - metrics.header!.x)).toBeLessThanOrEqual(12);
    expect(Math.abs(metrics.jumboEmoji!.x - metrics.followupText!.x)).toBeLessThanOrEqual(4);
    expect(metrics.jumboEmoji!.y).toBeGreaterThanOrEqual(metrics.jumboRow!.y - 2);
    expect(metrics.jumboEmoji!.bottom).toBeLessThanOrEqual(metrics.jumboRow!.bottom + 2);
    expect(metrics.heartEmoji!.y).toBeGreaterThanOrEqual(metrics.heartRow!.y - 2);
    expect(metrics.heartEmoji!.bottom).toBeLessThanOrEqual(metrics.heartRow!.bottom + 2);

    await captureSnapshot(page, 'live-matrix/emoji-qa/timeline-alignment');
  });

  test('renders diagnostics and privacy settings on the real settings route', async () => {
    test.skip(
      Boolean(sentryDsn),
      'Settings assertions run in the non-Sentry live smoke environment'
    );

    await page.goto('/settings/general');

    await expect(page).toHaveURL(/\/settings\/general\/?$/);
    await expect(page.getByText('Diagnostics & Privacy')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-settings-focus="error-reporting"]')).toBeVisible();
  });

  test('renders the developer tools Sentry section on the real settings route', async () => {
    test.skip(
      Boolean(sentryDsn),
      'Settings assertions run in the non-Sentry live smoke environment'
    );

    await enableDeveloperTools(page);

    await expect(page).toHaveURL(/\/settings\/developer-tools\/?$/);
    await expect(page.getByText('Developer Tools')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('Error Tracking (Sentry)')).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText('Sentry is not configured. Set VITE_SENTRY_DSN to enable error tracking.')
    ).toBeVisible({ timeout: 60_000 });
  });
});
