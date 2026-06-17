import { expect, test } from '@playwright/test';
import { installSmokeApp, seedLaunchContext, seedStoredSession } from './smokeApp';

test.describe('app startup smoke', () => {
  test('retries config.json during startup and still reaches login', async ({ page }) => {
    const smokeApp = await installSmokeApp(page, { configFailuresBeforeSuccess: 2 });

    await page.goto('/');

    await expect(page).toHaveURL(/#\/login\/smoke\.test\/?$/);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    expect(smokeApp.getConfigRequestCount()).toBe(3);
  });

  test('normalizes hash-router login tokens into the routed login URL', async ({ page }) => {
    await installSmokeApp(page);

    await page.goto('/?loginToken=smoke-token#/login/smoke.test/');

    await expect(page).toHaveURL(/#\/login\/smoke\.test\/?\?loginToken=smoke-token$/);
    await expect(page.getByText('Invalid login token.')).toBeVisible();
  });

  test('preserves unauthenticated deep-link redirects for /to routes', async ({ page }) => {
    await installSmokeApp(page);

    const deepLink =
      '/#/to/%40alice%3Asmoke.test/%21room%3Asmoke.test/%24event%3Asmoke.test?joinCall=true';

    await page.goto(deepLink);

    await expect(page).toHaveURL(/#\/login\/smoke\.test\/?$/);

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('after_login_redirect_url')))
      .toBe('/to/%40alice%3Asmoke.test/%21room%3Asmoke.test/%24event%3Asmoke.test?joinCall=true');
  });

  test('restores a stored session into the home route before client init completes', async ({
    page,
  }) => {
    await installSmokeApp(page);
    await seedStoredSession(page);

    await page.goto('/');

    await expect(page).toHaveURL(/#\/home\/?$/);
    await expect(page.getByText('Petting cats')).toBeVisible();
  });

  test('keeps authenticated notification restore routes out of the login flow', async ({
    page,
  }) => {
    await installSmokeApp(page);
    await seedStoredSession(page);

    await page.goto(
      '/#/to/%40smoke%3Asmoke.test/%21room%3Asmoke.test/%24event%3Asmoke.test?joinCall=true'
    );

    await expect(
      page,
      'stored sessions should keep /to notification restore inside the authenticated boot path'
    ).toHaveURL(
      /#\/to\/%40smoke%3Asmoke\.test\/%21room%3Asmoke\.test\/%24event%3Asmoke\.test\?joinCall=true$/
    );
    await expect(page.getByText('Petting cats')).toBeVisible();
  });

  test('recovers a persisted notification launch target during bootstrap', async ({ page }) => {
    await installSmokeApp(page);
    await seedStoredSession(page);
    await seedLaunchContext(
      page,
      'http://127.0.0.1:4173/#/to/%40smoke%3Asmoke.test/%21room%3Asmoke.test/%24event%3Asmoke.test'
    );

    await page.goto('/');

    await expect(page).toHaveURL(
      /#\/to\/%40smoke%3Asmoke\.test\/%21room%3Asmoke\.test\/%24event%3Asmoke\.test$/
    );
  });
});
