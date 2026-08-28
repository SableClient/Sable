import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import {
  createRoom,
  inviteUser,
  joinRoom,
  registerUser,
  sendText,
  type RegisteredUser,
} from './fixtures/continuwuity';
import { homeserverBaseUrl, loginAsFreshUser, PASSWORD } from './fixtures/session';
import {
  canonicalEventIds,
  expectContiguousRun,
  expectNoDuplicateRows,
  renderedEventIds,
  wheelToTopUntilVisible,
} from './fixtures/timelineOrder';
import { AppShell } from './pages/AppShell';

const BURST_SIZE = 60;
const SEED_SIZE = 10;
const SYNC_TIMEOUT = 180_000;

type Fixture = {
  app: AppShell;
  hsBaseUrl: string;
  tag: string;
  alice: RegisteredUser;
  bob: RegisteredUser;
  roomId: string;
  seedIds: string[];
};

let txnCounter = 1;
const nextTxnId = () => {
  txnCounter += 1;
  return txnCounter;
};

/** A fresh account in a two-person room whose latest messages are already loaded. */
async function openSeededRoom(
  page: Page,
  storageStatePath: string,
  prefix: string,
  slidingSyncOptIn: boolean
): Promise<Fixture> {
  const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
  const tag = `${prefix}-${process.pid}-${Date.now().toString(36)}`;
  const app = new AppShell(page);
  const alice = await loginAsFreshUser(page, hsBaseUrl, `${tag}-a`, slidingSyncOptIn);
  const bob = await registerUser(hsBaseUrl, `${tag}-b`, PASSWORD);

  const roomId = await createRoom(hsBaseUrl, alice.accessToken, {
    name: `${tag} Relay`,
    preset: 'private_chat',
  });
  await inviteUser(hsBaseUrl, alice.accessToken, roomId, bob.userId);
  await joinRoom(hsBaseUrl, bob.accessToken, roomId);

  const seedIds: string[] = [];
  for (let i = 1; i <= SEED_SIZE; i += 1) {
    seedIds.push(
      await sendText(hsBaseUrl, alice.accessToken, roomId, `${tag}-seed-${i}`, nextTxnId())
    );
  }

  return { app, hsBaseUrl, tag, alice, bob, roomId, seedIds };
}

async function enterRoom(page: Page, fixture: Fixture): Promise<void> {
  await page.goto('/');
  await expect(page.getByText(`${fixture.tag} Relay`).first()).toBeVisible({
    timeout: SYNC_TIMEOUT,
  });
  await fixture.app.openRoom(`${fixture.tag} Relay`);
  await expect(fixture.app.messageByEventId(fixture.seedIds.at(-1)!)).toBeVisible({
    timeout: SYNC_TIMEOUT,
  });
}

/** Sends a burst Alice never syncs, and returns the id of the `index`-th message. */
async function sendMissedBurst(fixture: Fixture, index: number): Promise<string> {
  let targetEventId = '';
  for (let i = 1; i <= BURST_SIZE; i += 1) {
    const eventId = await sendText(
      fixture.hsBaseUrl,
      fixture.bob.accessToken,
      fixture.roomId,
      `${fixture.tag}-burst-${i}`,
      nextTxnId()
    );
    if (i === index) targetEventId = eventId;
  }
  return targetEventId;
}

/**
 * The target must be on screen, and the newest message must not be: a jump that
 * silently lands on the live tail otherwise satisfies a plain visibility check.
 */
async function expectJumpedTo(page: Page, fixture: Fixture, eventId: string): Promise<void> {
  await expect(fixture.app.messageByEventId(eventId)).toBeInViewport({ timeout: SYNC_TIMEOUT });
  await expect(
    page.getByText(`${fixture.tag}-burst-${BURST_SIZE}`, { exact: true })
  ).not.toBeInViewport();
}

async function expectJumpedToLatest(page: Page, fixture: Fixture, eventId: string): Promise<void> {
  await expect(fixture.app.messageByEventId(eventId)).toBeInViewport({ timeout: SYNC_TIMEOUT });
  await expectOrderedTimeline(page, fixture);
}

async function expectOrderedTimeline(page: Page, fixture: Fixture): Promise<void> {
  const canonical = await canonicalEventIds(
    fixture.hsBaseUrl,
    fixture.alice.accessToken,
    fixture.roomId,
    fixture.tag
  );
  const rendered = await renderedEventIds(page, canonical);
  expectNoDuplicateRows(rendered);
  expectContiguousRun(rendered, canonical);
}

const syncTransports = [
  { name: 'classic sync', slidingSyncOptIn: false },
  { name: 'sliding sync', slidingSyncOptIn: true },
];

for (const transport of syncTransports) {
  test.describe(`notification jumps (${transport.name})`, () => {
    test.describe.configure({ timeout: 300_000 });

    test('places a notification target from a missed burst in canonical order', async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'touch', 'covered by the mobile browser viewport');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-mid',
        transport.slidingSyncOptIn
      );
      await enterRoom(page, fixture);

      await context.setOffline(true);
      const targetEventId = await sendMissedBurst(fixture, 40);
      await fixture.app.receiveNotificationClick(
        fixture.alice.userId,
        fixture.roomId,
        targetEventId
      );
      await context.setOffline(false);

      await expectJumpedTo(page, fixture, targetEventId);
      await expectOrderedTimeline(page, fixture);
    });

    test('places a notification target older than the catch-up window in canonical order', async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'touch', 'covered by the mobile browser viewport');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-old',
        transport.slidingSyncOptIn
      );
      await enterRoom(page, fixture);

      await context.setOffline(true);
      const targetEventId = await sendMissedBurst(fixture, 5);
      await fixture.app.receiveNotificationClick(
        fixture.alice.userId,
        fixture.roomId,
        targetEventId
      );
      await context.setOffline(false);

      await expectJumpedTo(page, fixture, targetEventId);
      await expectOrderedTimeline(page, fixture);
      expect(page.url()).toContain(encodeURIComponent(targetEventId));

      await page.reload();
      await expectJumpedTo(page, fixture, targetEventId);
      await expectOrderedTimeline(page, fixture);
    });

    test('does not present the two sides of a gap as adjacent while the room stays open', async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-gap',
        transport.slidingSyncOptIn
      );
      await enterRoom(page, fixture);

      await context.setOffline(true);
      await sendMissedBurst(fixture, BURST_SIZE);
      await context.setOffline(false);

      await expect(
        page.getByText(`${fixture.tag}-burst-${BURST_SIZE}`, { exact: true })
      ).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });
      await expectOrderedTimeline(page, fixture);
    });

    test('back-paginates contiguously after a notification jump', async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-back',
        transport.slidingSyncOptIn
      );
      await enterRoom(page, fixture);

      await context.setOffline(true);
      const targetEventId = await sendMissedBurst(fixture, 5);
      await fixture.app.receiveNotificationClick(
        fixture.alice.userId,
        fixture.roomId,
        targetEventId
      );
      await context.setOffline(false);

      await expectJumpedTo(page, fixture, targetEventId);

      await wheelToTopUntilVisible(page, `${fixture.tag}-seed-${SEED_SIZE}`);
      await expectOrderedTimeline(page, fixture);
    });

    test('keeps the timeline ordered across two consecutive notification jumps', async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-twice',
        transport.slidingSyncOptIn
      );
      await enterRoom(page, fixture);

      await context.setOffline(true);
      const olderTarget = await sendMissedBurst(fixture, 5);
      await fixture.app.receiveNotificationClick(fixture.alice.userId, fixture.roomId, olderTarget);
      await context.setOffline(false);

      await expectJumpedTo(page, fixture, olderTarget);
      await expectOrderedTimeline(page, fixture);

      const newerTarget = fixture.seedIds[0]!;
      await fixture.app.receiveNotificationClick(fixture.alice.userId, fixture.roomId, newerTarget);
      await expect(fixture.app.messageByEventId(newerTarget)).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });
      await expectOrderedTimeline(page, fixture);
    });

    test('places a cold-start notification target in canonical order', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-cold',
        transport.slidingSyncOptIn
      );
      const targetEventId = await sendMissedBurst(fixture, 5);

      await fixture.app.openNotificationColdStart(
        fixture.alice.userId,
        fixture.roomId,
        targetEventId
      );

      await expectJumpedTo(page, fixture, targetEventId);
      await expectOrderedTimeline(page, fixture);
    });

    test('places a cold-start latest notification target in canonical order', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'touch', 'covered by the mobile browser viewport');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-cold-latest',
        transport.slidingSyncOptIn
      );
      const targetEventId = await sendMissedBurst(fixture, BURST_SIZE);

      await fixture.app.openNotificationColdStart(
        fixture.alice.userId,
        fixture.roomId,
        targetEventId
      );

      await expectJumpedToLatest(page, fixture, targetEventId);
    });

    test('places a notification target before the room has been opened in canonical order', async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'touch', 'covered by the mobile browser viewport');
      const fixture = await openSeededRoom(
        page,
        testInfo.project.use.storageState as string,
        'nj-unopened',
        transport.slidingSyncOptIn
      );
      await page.goto('/');
      await expect(page.getByText(`${fixture.tag} Relay`).first()).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });

      await context.setOffline(true);
      const targetEventId = await sendMissedBurst(fixture, 5);
      await fixture.app.receiveNotificationClick(
        fixture.alice.userId,
        fixture.roomId,
        targetEventId
      );
      await context.setOffline(false);

      await expectJumpedTo(page, fixture, targetEventId);
      await expectOrderedTimeline(page, fixture);
    });
  });
}
