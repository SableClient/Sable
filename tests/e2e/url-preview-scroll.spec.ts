import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';
import { createRoom, sendText } from './fixtures/continuwuity';
import { AppShell } from './pages/AppShell';
import { homeserverBaseUrl, loginAsFreshUser } from './fixtures/session';

const MESSAGE_COUNT = 300;
const PREVIEW_DELAY_MS = 600;
const WHEEL = 400;
const SETTLE_STEPS = 3;

// Prefetching lets most cards mount at their final height. What is left is a card reached
// before its response lands, worth |placeholder - result| ~ 50px, twice if the measured pair
// straddles two. Without prefetching an og:image card scored 257px, and 326px when the
// placeholder's height was held instead.
const DRIFT_LIMIT = 150;

// A card that changes height when its preview lands moves the timeline under whoever is
// reading it. The three outcomes cover the range: an og:image card is far taller than the
// placeholder, a text-only card slightly taller, and a refused preview renders nothing.
type PreviewOutcome = 'image' | 'text' | 'refused';

const previewBody = (outcome: PreviewOutcome) =>
  JSON.stringify({
    'og:title': 'A late preview title',
    'og:description':
      'A description long enough to wrap onto the two clamped lines the card renders, so the card changes height when it resolves.',
    'og:site_name': 'example.com',
    ...(outcome === 'image'
      ? {
          'og:image': 'mxc://example.com/preview-image',
          'og:image:width': 1200,
          'og:image:height': 630,
          'matrix:image:size': 12345,
        }
      : {}),
  });

async function stubPreviews(page: Page, outcome: PreviewOutcome): Promise<void> {
  await page.route('**/preview_url*', async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, PREVIEW_DELAY_MS);
    });
    if (outcome === 'refused') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          errcode: 'M_FORBIDDEN',
          error: 'URL is not allowed to be previewed',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: previewBody(outcome),
    });
  });

  const pngBody = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route('**/_matrix/**/media/**', async (route) => {
    if (route.request().url().includes('preview_url')) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: pngBody });
  });
}

type Drift = {
  step: number;
  top: number;
  anchor: string;
  reference: string;
  expected: number;
  actual: number;
  drift: number;
};

type Row = { id: string; top: number };

/**
 * Scrolls up a notch at a time, measuring the distance between the row anchored just below
 * the viewport top and the topmost rendered row. Returns the worst deviation.
 *
 * Distance, not absolute position: virtua sizes rows it has never rendered from an average
 * of the measured ones, so discovering a ~350px preview row above the viewport slides the
 * whole timeline whatever the cards do.
 */
async function worstScrollDrift(page: Page): Promise<Drift> {
  const scroller = page.locator('#timeline-scroller');
  await expect(scroller).toBeVisible();

  // Let the first batch of previews settle so the starting height is stable.
  await page.waitForTimeout(2000);

  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const readTop = () => scroller.evaluate((el) => el.scrollTop);
  const shoot = (): Promise<Row[]> =>
    scroller.evaluate((el) =>
      Array.from(el.querySelectorAll('[data-message-id]')).map((r) => ({
        id: (r.textContent ?? '').slice(0, 40),
        top: r.getBoundingClientRect().top,
      }))
    );

  const drifts: Drift[] = [];
  for (let step = 0; step < 60; step += 1) {
    const before = await shoot();
    const anchor = before.find((r) => r.top > box.y + 20);
    const reference = before[0];
    const top = await readTop();
    if (!anchor || !reference || reference.id === anchor.id) break;
    await page.mouse.wheel(0, -WHEEL);
    await page.waitForTimeout(250);
    const after = await shoot();
    const topAfter = await readTop();
    // At the very top the scroller clamps, so the wheel cannot deliver its full delta
    // and the shortfall is arithmetic, not a jump.
    if (topAfter === 0) break;
    const anchorAfter = after.find((r) => r.id === anchor.id);
    const referenceAfter = after.find((r) => r.id === reference.id);
    if (!anchorAfter || !referenceAfter) continue; // recycled out of the rendered window
    const expected = anchor.top - reference.top;
    const actual = anchorAfter.top - referenceAfter.top;
    drifts.push({
      step,
      top,
      anchor: anchor.id.slice(-24),
      reference: reference.id.slice(-24),
      expected,
      actual,
      drift: actual - expected,
    });
  }

  // The opening notches are excluded: the timeline is still pinned to the bottom there
  // and the first batch of previews is still settling, so movement is expected.
  return drifts
    .filter((d) => d.step >= SETTLE_STEPS)
    .reduce((a, b) => (Math.abs(b.drift) > Math.abs(a.drift) ? b : a), {
      step: -1,
      top: 0,
      anchor: '',
      reference: '',
      expected: 0,
      actual: 0,
      drift: 0,
    });
}

async function seedRoomAndOpen(page: Page, hsBaseUrl: string, tag: string): Promise<void> {
  const app = new AppShell(page);
  const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);
  const room = await createRoom(hsBaseUrl, user.accessToken, {
    name: `${tag} Room`,
    preset: 'private_chat',
  });

  for (let i = 1; i <= MESSAGE_COUNT; i += 1) {
    // Every third message carries a link, so previews are spread through the timeline.
    const body =
      i % 3 === 0 ? `${tag}-m${i} https://example.com/${i}` : `${tag}-m${i} filler message`;
    await sendText(hsBaseUrl, user.accessToken, room, body, i);
  }
  const lastEventId = await sendText(
    hsBaseUrl,
    user.accessToken,
    room,
    `${tag}-last`,
    MESSAGE_COUNT + 1
  );

  await page.goto('/');
  await expect(page.getByText(`${tag} Room`).first()).toBeVisible({ timeout: 180_000 });
  await app.openRoom(`${tag} Room`);
  await expect(app.messageByEventId(lastEventId)).toBeVisible({ timeout: 120_000 });
}

test.describe('url preview scroll', () => {
  for (const outcome of ['image', 'text', 'refused'] as const) {
    test(`scrolling up holds its place when a ${outcome} preview resolves late`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-focused');
      test.setTimeout(300_000);
      const storageStatePath = testInfo.project.use.storageState as string;
      const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
      const tag = `preview-${outcome}-${process.pid}-${Date.now().toString(36)}`;

      await stubPreviews(page, outcome);
      await seedRoomAndOpen(page, hsBaseUrl, tag);

      const worst = await worstScrollDrift(page);
      expect(Math.abs(worst.drift), `worst drift: ${JSON.stringify(worst)}`).toBeLessThan(
        DRIFT_LIMIT
      );
    });
  }
});
