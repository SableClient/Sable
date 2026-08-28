import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { createRoom, inviteUser, joinRoom, registerUser, sendText } from './fixtures/continuwuity';
import { homeserverBaseUrl, loginAsFreshUser, PASSWORD } from './fixtures/session';
import {
  expectTimelineAtBottom,
  timelineScroller,
  wheelToBottomUntilVisible,
} from './fixtures/timelineOrder';
import { AppShell } from './pages/AppShell';

const HISTORY_SIZE = 100;
const SEND_DELAYS_MS = [0, 150, 0, 400, 50];
const TEST_TIMEOUT = 300_000;
const SYNC_TIMEOUT = 45_000;
const UI_TIMEOUT = 30_000;

let txnCounter = 1;

const nextTxnId = () => {
  txnCounter += 1;
  return txnCounter;
};

async function sendMessage(
  baseUrl: string,
  token: string,
  roomId: string,
  body: string
): Promise<void> {
  await sendText(baseUrl, token, roomId, body, nextTxnId());
}

async function sendHistory(
  baseUrl: string,
  token: string,
  roomId: string,
  prefix: string,
  bodies: string[]
): Promise<void> {
  for (let i = 0; i < bodies.length; i += 1) {
    await sendMessage(baseUrl, token, roomId, `${prefix}-${bodies[i]}`);
  }
}

async function wheelToTopUntilVisible(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await timelineScroller(page).hover();
    await page.mouse.wheel(0, -2400);
    expect(await page.getByText(text, { exact: true }).count()).toBeGreaterThan(0);
  }).toPass({ timeout: 120_000, intervals: [500] });
}

const syncTransports = [
  { name: 'sliding sync', slidingSyncOptIn: true },
  { name: 'legacy sync', slidingSyncOptIn: false },
];

for (const transport of syncTransports) {
  test.describe(`timeline lifecycle (${transport.name})`, () => {
    test('paginates backwards through pre-subscription history after leaving and reopening a room', async ({
      page,
    }, testInfo) => {
      test.setTimeout(TEST_TIMEOUT);
      const storageStatePath = testInfo.project.use.storageState as string;
      const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
      const tag = `hist-${process.pid}-${Date.now().toString(36)}`;
      const app = new AppShell(page);
      const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`, transport.slidingSyncOptIn);

      const room = await createRoom(hsBaseUrl, user.accessToken, {
        name: `${tag} DM`,
        preset: 'private_chat',
      });
      const remote = await registerUser(hsBaseUrl, `${tag}-remote`, PASSWORD);
      await inviteUser(hsBaseUrl, user.accessToken, room, remote.userId);
      await joinRoom(hsBaseUrl, remote.accessToken, room);
      const away = await createRoom(hsBaseUrl, user.accessToken, {
        name: `${tag} Away`,
        preset: 'private_chat',
      });

      const bodies = ['sentinel', ...Array.from({ length: HISTORY_SIZE - 1 }, (_, i) => `m${i}`)];
      const latest = `${tag}-m${HISTORY_SIZE - 2}`;
      const sentinel = `${tag}-sentinel`;
      await sendHistory(hsBaseUrl, remote.accessToken, room, tag, bodies);
      await sendMessage(hsBaseUrl, user.accessToken, away, `${tag}-away-msg`);

      await page.goto('/');
      await expect(page.getByText(`${tag} DM`).first()).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });

      await app.openRoom(`${tag} DM`);
      await expect(page.getByText(latest, { exact: true }).first()).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });
      await expectTimelineAtBottom(page);
      expect(await page.getByText(sentinel, { exact: true }).count()).toBe(0);

      if (testInfo.project.name !== 'desktop') await page.goto('/');
      await app.openRoom(`${tag} Away`);
      await expect(page.getByText(`${tag}-away-msg`, { exact: true })).toBeVisible({
        timeout: UI_TIMEOUT,
      });

      if (testInfo.project.name !== 'desktop') await page.goto('/');
      await app.openRoom(`${tag} DM`);
      await expect(page.getByText(latest, { exact: true }).first()).toBeVisible({
        timeout: UI_TIMEOUT,
      });
      await expectTimelineAtBottom(page);
      expect(await page.getByText(sentinel, { exact: true }).count()).toBe(0);

      await wheelToTopUntilVisible(page, sentinel);

      await wheelToBottomUntilVisible(page, latest);
    });

    test('renders messages received while the room was inactive exactly once, in order, after reopening', async ({
      page,
    }, testInfo) => {
      test.setTimeout(TEST_TIMEOUT);
      const storageStatePath = testInfo.project.use.storageState as string;
      const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
      const tag = `live-${process.pid}-${Date.now().toString(36)}`;
      const app = new AppShell(page);
      const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`, transport.slidingSyncOptIn);

      const room = await createRoom(hsBaseUrl, user.accessToken, {
        name: `${tag} Home`,
        preset: 'private_chat',
      });
      const away = await createRoom(hsBaseUrl, user.accessToken, {
        name: `${tag} Away`,
        preset: 'private_chat',
      });

      await sendMessage(hsBaseUrl, user.accessToken, room, `${tag}-seed`);
      await sendMessage(hsBaseUrl, user.accessToken, away, `${tag}-away-msg`);

      await page.goto('/');
      await expect(page.getByText(`${tag} Home`).first()).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });

      await app.openRoom(`${tag} Home`);
      await expect(page.getByText(`${tag}-seed`, { exact: true })).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });

      if (testInfo.project.name !== 'desktop') await page.goto('/');
      await app.openRoom(`${tag} Away`);
      await expect(page.getByText(`${tag}-away-msg`, { exact: true })).toBeVisible({
        timeout: UI_TIMEOUT,
      });

      for (let i = 0; i < SEND_DELAYS_MS.length; i += 1) {
        if (SEND_DELAYS_MS[i]! > 0) await page.waitForTimeout(SEND_DELAYS_MS[i]!);
        await sendMessage(hsBaseUrl, user.accessToken, room, `${tag}-live-${i + 1}`);
      }

      if (testInfo.project.name !== 'desktop') await page.goto('/');
      await app.openRoom(`${tag} Home`);
      await expect(page.getByText(`${tag}-seed`, { exact: true })).toBeVisible({
        timeout: UI_TIMEOUT,
      });

      for (let i = 0; i < SEND_DELAYS_MS.length; i += 1) {
        await expect(page.getByText(`${tag}-live-${i + 1}`, { exact: true })).toHaveCount(1, {
          timeout: UI_TIMEOUT,
        });
        await expect(page.getByText(`${tag}-live-${i + 1}`, { exact: true })).toBeVisible();
      }

      const domOrder = await page.getByText(new RegExp(`^${tag}-live-\\d+$`)).allTextContents();
      expect(domOrder).toEqual(SEND_DELAYS_MS.map((_, i) => `${tag}-live-${i + 1}`));
    });
  });
}
