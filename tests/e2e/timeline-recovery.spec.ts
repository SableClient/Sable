import { test, expect } from './fixtures/test';
import {
  createRoom,
  getRoomMessages,
  inviteUser,
  joinRoom,
  registerUser,
  sendText,
} from './fixtures/continuwuity';
import { homeserverBaseUrl, loginAsFreshUser, PASSWORD } from './fixtures/session';
import { AppShell } from './pages/AppShell';

let txnCounter = 1;

test.describe('timeline recovery', () => {
  test('renders a remote burst received while offline exactly once, in canonical order', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `off-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const alice = await loginAsFreshUser(page, hsBaseUrl, `${tag}-a`);
    const bob = await registerUser(hsBaseUrl, `${tag}-b`, PASSWORD);

    const room = await createRoom(hsBaseUrl, alice.accessToken, {
      name: `${tag} Relay`,
      preset: 'private_chat',
    });
    await inviteUser(hsBaseUrl, alice.accessToken, room, bob.userId);
    await joinRoom(hsBaseUrl, bob.accessToken, room);
    txnCounter += 1;
    await sendText(hsBaseUrl, alice.accessToken, room, `${tag}-seed`, txnCounter);

    await page.goto('/');
    await expect(page.getByText(`${tag} Relay`).first()).toBeVisible({
      timeout: 180_000,
    });
    await app.openRoom(`${tag} Relay`);
    await expect(page.getByText(`${tag}-seed`, { exact: true })).toBeVisible({
      timeout: 180_000,
    });

    await context.setOffline(true);

    const burstCount = 6;
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < burstCount; i += 1) {
      txnCounter += 1;
      await sendText(hsBaseUrl, bob.accessToken, room, `${tag}-burst-${i + 1}`, txnCounter);
    }
    /* eslint-enable no-await-in-loop */

    await context.setOffline(false);

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < burstCount; i += 1) {
      await expect(page.getByText(`${tag}-burst-${i + 1}`, { exact: true })).toHaveCount(1, {
        timeout: 180_000,
      });
      await expect(page.getByText(`${tag}-burst-${i + 1}`, { exact: true })).toBeVisible();
    }
    /* eslint-enable no-await-in-loop */

    const canonical = (await getRoomMessages(hsBaseUrl, alice.accessToken, room))
      .map((m) => m.body)
      .filter((body) => body.startsWith(`${tag}-`));
    const domOrder = (
      await page.getByText(new RegExp(`^${tag}-(seed|burst-\\d+)$`)).allTextContents()
    ).map((text) => text.trim());
    expect(domOrder).toEqual(canonical);
  });

  test('retries a failed offline composer send to exactly one server-confirmed message', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `retry-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    const room = await createRoom(hsBaseUrl, user.accessToken, {
      name: `${tag} Outbox`,
      preset: 'private_chat',
    });
    txnCounter += 1;
    await sendText(hsBaseUrl, user.accessToken, room, `${tag}-seed`, txnCounter);

    await page.goto('/');
    await expect(page.getByText(`${tag} Outbox`).first()).toBeVisible({
      timeout: 180_000,
    });
    await app.openRoom(`${tag} Outbox`);
    await expect(page.getByText(`${tag}-seed`, { exact: true })).toBeVisible({
      timeout: 180_000,
    });

    await context.setOffline(true);

    const body = `${tag}-retry-body`;
    await app.sendTextMessage(body);

    const failedMessage = page.locator('[data-message-id]').filter({ hasText: body });
    await expect(failedMessage).toHaveCount(1, { timeout: 180_000 });
    const failedStatus = failedMessage.getByText('Failed to send.', { exact: true });
    await expect(failedStatus).toBeVisible();
    const retryButton = failedMessage.getByRole('button', {
      name: 'Retry',
      exact: true,
    });
    await expect(retryButton).toHaveCount(1);
    await expect(retryButton).toBeVisible();

    await context.setOffline(false);

    await retryButton.click();

    await expect(page.locator('[data-message-id]').filter({ hasText: body })).toHaveCount(1, {
      timeout: 180_000,
    });
    await expect(page.locator('[data-message-id]').filter({ hasText: body })).toBeVisible();
    await expect(failedStatus).toHaveCount(0, { timeout: 180_000 });

    await expect
      .poll(
        async () =>
          (await getRoomMessages(hsBaseUrl, user.accessToken, room)).filter((m) => m.body === body)
            .length,
        { timeout: 60_000 }
      )
      .toBe(1);
  });
});
