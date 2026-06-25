import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const server = process.env.LIVE_MATRIX_SERVER;
const username = process.env.LIVE_MATRIX_USERNAME;
const password = process.env.LIVE_MATRIX_PASSWORD;
const roomId = process.env.LIVE_MATRIX_ROOM_ID;
const roomName = process.env.LIVE_MATRIX_ROOM_NAME;
const LIVE_TEST_TIMEOUT_MS = 90_000;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const requireEnv = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`${name} must be set`);
  return value;
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
  await page.getByRole('button', { name: 'Login' }).click();

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
    await expect(page.getByText('Petting cats')).toBeHidden({ timeout: 60_000 });
    await expectStoredSession(page);
  });

  test('opens a known room when LIVE_MATRIX_ROOM_ID is configured', async () => {
    test.skip(!roomId, 'LIVE_MATRIX_ROOM_ID must be set to validate room navigation');

    const encodedRoomId = encodeURIComponent(requireEnv(roomId, 'LIVE_MATRIX_ROOM_ID'));
    await page.goto(`/home/${encodedRoomId}`);

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
      .toMatch(new RegExp(`/home/${escapeRegExp(encodedRoomId)}/?$`));

    if (roomName) {
      await expect(
        page.getByRole('button', {
          name: new RegExp(`^${escapeRegExp(roomName)},`),
        })
      ).toBeVisible({ timeout: 60_000 });
    }
  });

  test('renders diagnostics and privacy settings on the real settings route', async () => {
    await page.goto('/settings/general');

    await expect(page).toHaveURL(/\/settings\/general\/?$/);
    await expect(page.getByText('Diagnostics & Privacy')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-settings-focus="error-reporting"]')).toBeVisible();
  });

  test('renders the developer tools Sentry section on the real settings route', async () => {
    await enableDeveloperTools(page);

    await expect(page).toHaveURL(/\/settings\/developer-tools\/?$/);
    await expect(page.getByText('Developer Tools')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Error Tracking (Sentry)')).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText('Sentry is not configured. Set VITE_SENTRY_DSN to enable error tracking.')
    ).toBeVisible({ timeout: 60_000 });
  });
});
