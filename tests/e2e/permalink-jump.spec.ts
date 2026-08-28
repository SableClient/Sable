import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { createRoom, sendMessage, sendText } from './fixtures/continuwuity';
import { homeserverBaseUrl, loginAsFreshUser } from './fixtures/session';
import { wheelToBottomUntilVisible, wheelToTopUntilVisible } from './fixtures/timelineOrder';
import { AppShell } from './pages/AppShell';

const HISTORY_SIZE = 100;

const permalinkTo = (roomId: string, eventId: string): string =>
  `https://matrix.to/#/${roomId}/${eventId}`;

const permalinkLink = (page: Page, eventId: string) =>
  page.locator(`a[data-mention-event-id="${eventId}"]`);

function sendPermalink(
  baseUrl: string,
  token: string,
  roomId: string,
  targetEventId: string,
  txnId: number
): Promise<string> {
  const url = permalinkTo(roomId, targetEventId);
  return sendMessage(
    baseUrl,
    token,
    roomId,
    {
      msgtype: 'm.text',
      body: url,
      format: 'org.matrix.custom.html',
      formatted_body: `<a href="${url}">permalink</a>`,
    },
    txnId
  );
}

test.describe('permalink jumps', () => {
  test('jumps to a message beyond the loaded window when its permalink is clicked', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `plink-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    const room = await createRoom(hsBaseUrl, user.accessToken, {
      name: `${tag} Room`,
      preset: 'private_chat',
    });

    // The client initially loads only the latest 60 events, so message 20 sits
    // outside the loaded timeline: the jump has to fetch its context.
    let firstId = '';
    let targetId = '';
    let latestId = '';
    for (let i = 1; i <= HISTORY_SIZE; i += 1) {
      const eventId = await sendText(hsBaseUrl, user.accessToken, room, `${tag}-${i}`, i);
      if (i === 1) firstId = eventId;
      if (i === 20) targetId = eventId;
      latestId = eventId;
    }
    await sendPermalink(hsBaseUrl, user.accessToken, room, targetId, HISTORY_SIZE + 1);

    await page.goto('/');
    await expect(page.getByText(`${tag} Room`).first()).toBeVisible({ timeout: 180_000 });
    await page.goto(`/home/${encodeURIComponent(room)}`);

    const targetRow = app.messageByEventId(targetId);
    await expect(permalinkLink(page, targetId)).toBeVisible({ timeout: 60_000 });
    await expect(targetRow).toHaveCount(0);

    await permalinkLink(page, targetId).click();

    await expect(targetRow).toBeVisible({ timeout: 60_000 });
    await expect(app.messageByEventId(latestId)).toHaveCount(0);
    await expect(app.messageByEventId(firstId)).toHaveCount(0);

    await page.reload();
    await expect(targetRow).toBeInViewport({ timeout: 60_000 });
    await expect(app.messageByEventId(latestId)).toHaveCount(0);
    await expect(app.messageByEventId(firstId)).toHaveCount(0);

    await wheelToTopUntilVisible(page, `${tag}-1`);
    await expect(app.messageByEventId(firstId)).toBeVisible({ timeout: 60_000 });

    await wheelToBottomUntilVisible(page, `${tag}-${HISTORY_SIZE}`);
    await expect(app.messageByEventId(latestId)).toBeVisible({ timeout: 60_000 });

    await expect(app.messageByEventId(latestId)).toBeVisible({ timeout: 60_000 });
  });

  test('opens the thread when the permalink target is a thread reply', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `plinkf-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    const room = await createRoom(hsBaseUrl, user.accessToken, {
      name: `${tag} Room`,
      preset: 'private_chat',
    });

    // Thread reply permalinks reroute to the thread drawer instead of jumping
    // the main timeline (Room.tsx opens it for events with a threadRootId).
    let txn = 1;
    let replyId = '';
    for (let i = 1; i <= HISTORY_SIZE; i += 1) {
      const eventId = await sendText(hsBaseUrl, user.accessToken, room, `${tag}-${i}`, txn);
      txn += 1;
      if (i === 50) {
        const rootId = eventId;
        replyId = await sendMessage(
          hsBaseUrl,
          user.accessToken,
          room,
          {
            msgtype: 'm.text',
            body: `${tag}-thread-reply`,
            'm.relates_to': {
              rel_type: 'm.thread',
              event_id: rootId,
              is_falling_back: true,
              'm.in_reply_to': { event_id: rootId },
            },
          },
          txn
        );
        txn += 1;
      }
    }
    await sendPermalink(hsBaseUrl, user.accessToken, room, replyId, txn);

    await page.goto('/');
    await expect(page.getByText(`${tag} Room`).first()).toBeVisible({ timeout: 180_000 });
    await app.openRoom(`${tag} Room`);

    await expect(permalinkLink(page, replyId)).toBeVisible({ timeout: 60_000 });

    await permalinkLink(page, replyId).click();

    await expect(page.getByRole('button', { name: 'Close thread' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(`${tag}-thread-reply`, { exact: true })).toBeVisible();
  });
});
