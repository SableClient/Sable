import { test, expect } from './fixtures/test';
import { LOGIN_PASSWORD, LOGIN_USERNAME } from './fixtures/loginAccount';
import { e2eStorageStatePath } from './fixtures/runtime';
import { homeserverBaseUrl } from './fixtures/session';

const CLIENT_READY_TIMEOUT = 30_000;

// The container homeserver is reachable only by url ("http://127.0.0.1:<port>"), which is the
// shape that used to break: as a path segment it needs %2F, and hosting rewrites that to "/".
const homeserverUrl = (storageStatePath: string) => homeserverBaseUrl(storageStatePath);

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('password login against a homeserver given as a url', () => {
  test('keeps the homeserver in the query string and lands in the app', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?server=/);

    const server = await homeserverUrl(e2eStorageStatePath());
    await page.getByRole('textbox').first().fill(server);
    await page.getByRole('textbox').first().press('Enter');

    await expect(page).toHaveURL(`/login?server=${encodeURIComponent(server)}`);

    const username = page.getByRole('textbox', { name: 'Username' });
    await expect(username).toBeVisible({ timeout: CLIENT_READY_TIMEOUT });
    await username.fill(LOGIN_USERNAME);
    await page.getByRole('textbox', { name: 'Password' }).fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/home/, { timeout: CLIENT_READY_TIMEOUT });
  });

  test('survives a reload of the login url', async ({ page }) => {
    const server = await homeserverUrl(e2eStorageStatePath());
    await page.goto(`/login?server=${encodeURIComponent(server)}`);
    await page.reload();

    await expect(page).toHaveURL(`/login?server=${encodeURIComponent(server)}`);
    await expect(page.getByRole('textbox').first()).toHaveValue(server);
  });

  test('redirects a link that still carries the homeserver in the path', async ({ page }) => {
    await page.goto('/login/matrix.org?loginToken=tok');

    await expect(page).toHaveURL('/login?loginToken=tok&server=matrix.org');
  });
});
