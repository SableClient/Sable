import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { homeserverBaseUrl, loginAsFreshUser, PASSWORD } from './fixtures/session';

const UPLOAD_ROUTE = '**/_matrix/client/*/keys/device_signing/upload';
const TICKET_PATH = '/e2e-oauth-ticket';
const SESSION = 'e2e-reset-oauth-session';

type AuthDict = { type?: string; session?: string };

const recoveryKeyShown = (page: Page) => page.getByRole('button', { name: 'Copy', exact: true });

test.describe('device verification reset', () => {
  test('completes the UIA stage and reveals a new recovery key', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    await loginAsFreshUser(
      page,
      hsBaseUrl,
      `reset-uia-${testInfo.project.name}-${process.pid}`,
      false
    );

    await page.goto('/settings/devices');

    await page.getByRole('button', { name: 'Enable' }).click({ timeout: 180_000 });
    await expect(page.getByText('Setup Device Verification')).toBeVisible();
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();
    await expect(recoveryKeyShown(page)).toBeVisible({ timeout: 120_000 });

    await page.reload();
    await page
      .locator('#device-verification')
      .locator('button[aria-pressed]')
      .click({ timeout: 180_000 });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();

    await expect(page.getByText('Reset Device Verification')).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
    await page.locator('input[name="passphraseInput"]').fill('a memorable passphrase');
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Account Password', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    const password = page.locator('input[name="passwordInput"]');
    await password.fill(PASSWORD);
    await password.press('Enter');

    await expect(recoveryKeyShown(page)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Account Password', { exact: true })).toBeHidden();
  });

  test('completes the m.oauth UIA stage and reveals a new recovery key', async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    await loginAsFreshUser(
      page,
      hsBaseUrl,
      `reset-oauth-${testInfo.project.name}-${process.pid}`,
      false
    );

    await page.goto('/settings/devices');

    await page.getByRole('button', { name: 'Enable' }).click({ timeout: 180_000 });
    await expect(page.getByText('Setup Device Verification')).toBeVisible();
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();
    await expect(recoveryKeyShown(page)).toBeVisible({ timeout: 120_000 });

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

    await page.reload();
    await page
      .locator('#device-verification')
      .locator('button[aria-pressed]')
      .click({ timeout: 180_000 });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();

    await expect(page.getByText('Reset Device Verification')).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Account Authorization')).toBeVisible({ timeout: 120_000 });

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue in Browser' }).click();
    await (await popup).close();
    await page.getByRole('button', { name: 'Continue', exact: true, disabled: false }).click();

    await expect(recoveryKeyShown(page)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Account Authorization')).toBeHidden();
    expect(authDicts[authDicts.length - 1]).toEqual({ type: 'm.oauth', session: SESSION });
  });

  test('resumes the m.oauth stage after a retry that ran before approval', async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    await loginAsFreshUser(
      page,
      hsBaseUrl,
      `reset-oauth-race-${testInfo.project.name}-${process.pid}`,
      false
    );

    await page.goto('/settings/devices');

    await page.getByRole('button', { name: 'Enable' }).click({ timeout: 180_000 });
    await expect(page.getByText('Setup Device Verification')).toBeVisible();
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();
    await expect(recoveryKeyShown(page)).toBeVisible({ timeout: 120_000 });

    const ticketUrl = `${baseURL}${TICKET_PATH}`;
    const submittedDicts: (AuthDict | undefined)[] = [];
    let approved = false;
    await page.route(`**${TICKET_PATH}`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>ticket</title>' })
    );
    await page.route(UPLOAD_ROUTE, async (route) => {
      const { auth } = route.request().postDataJSON() as { auth?: AuthDict };
      const submitted = auth?.session === SESSION;
      if (submitted) submittedDicts.push(auth);

      if (submitted && approved) {
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
          ...(submitted ? { errcode: 'M_FORBIDDEN', error: 'No OAuth ticket available' } : {}),
        }),
      });
    });

    await page.reload();
    await page
      .locator('#device-verification')
      .locator('button[aria-pressed]')
      .click({ timeout: 180_000 });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();

    await expect(page.getByText('Reset Device Verification')).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Account Authorization')).toBeVisible({ timeout: 120_000 });

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue in Browser' }).click();
    await (await popup).close();
    await page.getByRole('button', { name: 'Continue', exact: true, disabled: false }).click();

    await expect(page.getByText('No OAuth ticket available')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Continue in Browser' })).toBeHidden();

    await expect.poll(() => submittedDicts.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    expect(submittedDicts[0]).toEqual({ session: SESSION });
    expect(submittedDicts[1]).toEqual({ type: 'm.oauth', session: SESSION });

    approved = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect(recoveryKeyShown(page)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Account Authorization')).toBeHidden();
  });
});
