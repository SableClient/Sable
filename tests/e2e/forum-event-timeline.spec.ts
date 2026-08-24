import { test, expect } from './fixtures/test';
import { createRoom, sendText } from './fixtures/continuwuity';
import { AppShell } from './pages/AppShell';
import { homeserverBaseUrl, loginAsFreshUser } from './fixtures/session';

const FORUM_ROOM_TYPE = 'pl.chrome.forum';

test.describe('forum event timeline', () => {
  test('opens the event timeline of a forum room and stays on it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `evtl-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    // The entry only exists with developer tools on.
    await page.addInitScript(() => {
      localStorage.setItem('settings', JSON.stringify({ developerTools: true }));
    });

    const forumId = await createRoom(hsBaseUrl, user.accessToken, {
      name: `${tag} Forum`,
      preset: 'private_chat',
      creation_content: { type: FORUM_ROOM_TYPE },
    });
    await sendText(hsBaseUrl, user.accessToken, forumId, `${tag} topic one`, 1);

    await page.goto('/');
    await expect(page.getByText(`${tag} Forum`).first()).toBeVisible({ timeout: 180_000 });
    await app.openRoom(`${tag} Forum`);
    await expect(page).toHaveURL(/\/forum\/?$/);
    await expect(page.getByText(`${tag} topic one`).first()).toBeVisible();

    // The forum header's options button, not the room nav item's.
    const options = page.getByRole('button', { name: 'More Options' });
    await expect(options).toHaveCount(2);
    await options.last().click();
    await page.getByRole('button', { name: 'Event Timeline' }).click();

    await expect(page.getByText(`${tag} topic one`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/forum\/?$/);
    await expect(page.getByText(`${tag} topic one`).first()).toBeVisible();
  });

  test('keeps the timeline route of a forum room when opened cold', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `evtlcold-${process.pid}-${Date.now().toString(36)}`;
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    const forumId = await createRoom(hsBaseUrl, user.accessToken, {
      name: `${tag} Forum`,
      preset: 'private_chat',
      creation_content: { type: FORUM_ROOM_TYPE },
    });
    await sendText(hsBaseUrl, user.accessToken, forumId, `${tag} topic one`, 1);

    await page.goto(`/home/${encodeURIComponent(forumId)}/?timeline=true`);
    await expect(page.getByText(`${tag} topic one`).first()).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/forum\/?$/);
    await expect(page.getByText(`${tag} topic one`).first()).toBeVisible();
  });
});
