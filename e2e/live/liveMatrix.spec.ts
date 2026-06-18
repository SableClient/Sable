import { expect, test } from '@playwright/test';

const server = process.env.LIVE_MATRIX_SERVER;
const username = process.env.LIVE_MATRIX_USERNAME;
const password = process.env.LIVE_MATRIX_PASSWORD;
const roomId = process.env.LIVE_MATRIX_ROOM_ID;
const roomName = process.env.LIVE_MATRIX_ROOM_NAME;

test.describe('live matrix smoke', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !server || !username || !password,
    'LIVE_MATRIX_SERVER, LIVE_MATRIX_USERNAME, and LIVE_MATRIX_PASSWORD must be set'
  );

  test('logs into a live Matrix account and reaches the client shell', async ({ page }) => {
    try {
      await page.goto(`/login/${encodeURIComponent(server!)}`);

      await expect(page.locator('input').first()).toHaveValue(server!);
      await expect(page.locator('#login-username-input')).toBeVisible();
      await expect(page.locator('#login-password-input')).toBeVisible();

      await page.locator('#login-username-input').fill(username!);
      await page.locator('#login-password-input').fill(password!);
      await page.getByRole('button', { name: 'Login' }).click();

      await expect(page).toHaveURL(/\/home\/?$/, { timeout: 60_000 });

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

      await expect(page.getByText('Petting cats')).toBeHidden({ timeout: 60_000 });
      await expect(page.getByRole('link', { name: 'Source Code' })).toBeVisible({
        timeout: 60_000,
      });

      if (roomId) {
        const encodedRoomId = encodeURIComponent(roomId);
        await page.goto(`/home/${encodedRoomId}`);
        await expect
          .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
          .toMatch(new RegExp(`/home/${encodedRoomId}/?$`));

        if (roomName) {
          await expect(page.getByText(roomName, { exact: true })).toBeVisible({ timeout: 60_000 });
        }
      }
    } finally {
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
          // Ignore cleanup failures so the test reports the real assertion result.
        } finally {
          localStorage.removeItem('matrixSessions');
          localStorage.removeItem('matrixActiveSession');
        }
      });
    }
  });
});
