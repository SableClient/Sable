import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { registerUser } from './fixtures/continuwuity';

const UPLOAD_ROUTE = '**/_matrix/client/*/keys/device_signing/upload';
const TICKET_PATH = '/e2e-oauth-ticket';
const SESSION = 'e2e-oauth-session';

type AuthDict = { type?: string; session?: string };
type InjectedSession = {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
};

async function homeserverBaseUrl(storageStatePath: string): Promise<string> {
  const state = JSON.parse(await readFile(storageStatePath, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const entry = state.origins[0]!.localStorage.find((item) => item.name === 'matrixSessions')!;
  return (JSON.parse(entry.value) as InjectedSession[])[0]!.baseUrl;
}

async function loginAsFreshUser(page: Page, baseUrl: string, name: string): Promise<void> {
  const user = await registerUser(baseUrl, name, 'test-passw0rd');
  const session: InjectedSession = {
    baseUrl,
    userId: user.userId,
    deviceId: user.deviceId,
    accessToken: user.accessToken,
  };
  await page.addInitScript((injected: InjectedSession) => {
    localStorage.setItem('matrixSessions', JSON.stringify([injected]));
    localStorage.setItem('matrixActiveSession', JSON.stringify(injected.userId));
    localStorage.setItem('dismissNotice', 'true');
  }, session);
}

test.describe('device verification setup', () => {
  test('completes the m.oauth UIA stage and reveals the recovery key', async ({
    page,
    baseURL,
  }, testInfo) => {
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    await loginAsFreshUser(page, hsBaseUrl, `oauth-uia-${testInfo.project.name}-${process.pid}`);

    const ticketUrl = `${baseURL}${TICKET_PATH}`;
    const authDicts: (AuthDict | undefined)[] = [];

    await page.route(`**${TICKET_PATH}`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>ticket</title>' })
    );

    await page.route(UPLOAD_ROUTE, async (route) => {
      const { auth } = route.request().postDataJSON() as { auth?: AuthDict };
      authDicts.push(auth);

      if (auth?.type === 'm.oauth' && auth.session === SESSION) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }

      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          flows: [{ stages: ['m.oauth'] }],
          params: { 'm.oauth': { url: ticketUrl } },
          session: SESSION,
        }),
      });
    });

    await page.goto('/settings/devices');

    await page.getByRole('button', { name: 'Enable' }).click({ timeout: 180_000 });
    await expect(page.getByText('Setup Device Verification')).toBeVisible();
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Account Authorization')).toBeVisible({ timeout: 120_000 });

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue in Browser' }).click();
    await (await popup).close();

    await page.getByRole('button', { name: 'Continue', exact: true, disabled: false }).click();

    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText('Account Authorization')).toBeHidden();

    expect(authDicts.length).toBeGreaterThanOrEqual(2);
    expect(authDicts.find((auth) => auth?.session === SESSION)).toEqual({ session: SESSION });
    expect(authDicts[authDicts.length - 1]).toEqual({ type: 'm.oauth', session: SESSION });
  });
});
