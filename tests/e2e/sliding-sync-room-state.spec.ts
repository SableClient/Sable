import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { createRoom, registerUser, sendText, setRoomName } from './fixtures/continuwuity';
import { AppShell, CLIENT_READY_TIMEOUT } from './pages/AppShell';

const PASSWORD = 'test-passw0rd';

// More rooms than the window the joined list used to shrink to.
const FILLER_ROOM_COUNT = 5;

type InjectedSession = {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  slidingSyncOptIn?: boolean;
};

async function homeserverBaseUrl(storageStatePath: string): Promise<string> {
  const state = JSON.parse(await readFile(storageStatePath, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const entry = state.origins[0]!.localStorage.find((item) => item.name === 'matrixSessions')!;
  return (JSON.parse(entry.value) as InjectedSession[])[0]!.baseUrl;
}

async function loginAsFreshUser(
  page: Page,
  baseUrl: string,
  name: string
): Promise<{ accessToken: string }> {
  const user = await registerUser(baseUrl, name, PASSWORD);
  const session: InjectedSession = {
    baseUrl,
    userId: user.userId,
    deviceId: user.deviceId,
    accessToken: user.accessToken,
    slidingSyncOptIn: true,
  };
  await page.addInitScript((injected: InjectedSession) => {
    localStorage.setItem('matrixSessions', JSON.stringify([injected]));
    localStorage.setItem('matrixActiveSession', JSON.stringify(injected.userId));
    localStorage.setItem('dismissNotice', 'true');
  }, session);
  return user;
}

test.describe('sliding sync room state', () => {
  // Regression guard for #1389: reintroducing the post-hydration narrowing of the
  // joined list fails this. Rooms outside the server's own window are not covered.
  test('applies a rename to a room that is neither open nor recently active', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `state-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    const staleName = `${tag} Stale`;
    const renamedName = `${tag} Renamed`;
    const stale = await createRoom(hsBaseUrl, user.accessToken, {
      name: staleName,
      preset: 'private_chat',
    });

    // Only these get recent activity, so the target sorts last by recency.
    const active: string[] = [];
    for (let i = 0; i < FILLER_ROOM_COUNT; i += 1) {
      active.push(
        // oxlint-disable-next-line no-await-in-loop
        await createRoom(hsBaseUrl, user.accessToken, {
          name: `${tag} Active ${i}`,
          preset: 'private_chat',
        })
      );
    }
    for (let i = 0; i < active.length; i += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await sendText(hsBaseUrl, user.accessToken, active[i]!, `${tag}-bump-${i}`, i + 1);
    }

    // Proves the client chose sliding sync and the homeserver accepted the request.
    const slidingSyncAccepted = page.waitForResponse(
      (response) =>
        response.url().includes('/org.matrix.simplified_msc3575/sync') && response.status() === 200,
      { timeout: CLIENT_READY_TIMEOUT }
    );

    await page.goto('/');
    await slidingSyncAccepted;
    await expect(app.room(staleName)).toBeVisible({ timeout: CLIENT_READY_TIMEOUT });

    // An active subscription would fetch state regardless of the list config.
    await app.openRoom(`${tag} Active 0`);
    await expect(page.getByText(`${tag}-bump-0`, { exact: true })).toBeVisible({
      timeout: CLIENT_READY_TIMEOUT,
    });

    await setRoomName(hsBaseUrl, user.accessToken, stale, renamedName);

    await expect(app.room(renamedName)).toBeVisible({ timeout: CLIENT_READY_TIMEOUT });
    await expect(page.getByText(staleName, { exact: true })).toHaveCount(0);
  });
});
