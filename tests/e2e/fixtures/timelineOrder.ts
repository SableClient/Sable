import { expect, type Locator, type Page } from '@playwright/test';
import { getRoomMessages } from './continuwuity';

/** Event IDs for `tag`, in the server's canonical order. */
export async function canonicalEventIds(
  baseUrl: string,
  token: string,
  roomId: string,
  tag: string
): Promise<string[]> {
  const messages = await getRoomMessages(baseUrl, token, roomId);
  return messages
    .filter((message) => message.body.startsWith(`${tag}-`))
    .map((message) => message.eventId);
}

/** Canonical message IDs currently rendered, top to bottom. */
export async function renderedEventIds(page: Page, canonicalIds: string[]): Promise<string[]> {
  const renderedIds = await page.locator('[data-message-id]').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const eventId = (element as HTMLElement).dataset.messageId;
      return eventId ? [eventId] : [];
    })
  );
  const canonical = new Set(canonicalIds);
  return renderedIds.filter((eventId) => canonical.has(eventId));
}

/**
 * Rendered rows must be a contiguous run of the canonical order. Fails both on
 * out-of-order events and on a gap presented as adjacent.
 */
export function expectContiguousRun(rendered: string[], canonical: string[]): void {
  expect(rendered.length, 'nothing rendered').toBeGreaterThan(0);
  const start = canonical.indexOf(rendered[0]!);
  expect(
    start,
    `first rendered row "${rendered[0]}" is not in the canonical order`
  ).toBeGreaterThan(-1);
  expect(
    canonical.slice(start, start + rendered.length),
    'rendered rows are not a contiguous, in-order run of the canonical timeline'
  ).toEqual(rendered);
}

/** A reconciliation that re-adds events to a second timeline shows up as dupes. */
export function expectNoDuplicateRows(rendered: string[]): void {
  const seen = new Set(rendered);
  expect([...seen], 'a message is rendered more than once').toEqual(rendered);
}

/** Scrolls the timeline up until `text` back-paginates into view. */
export async function wheelToTopUntilVisible(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await timelineScroller(page).hover();
    await page.mouse.wheel(0, -2400);
    expect(await page.getByText(text, { exact: true }).count()).toBeGreaterThan(0);
  }).toPass({ timeout: 120_000, intervals: [500] });
}

/** Scrolls the timeline down until `text` forward-paginates into view. */
export async function wheelToBottomUntilVisible(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await timelineScroller(page).hover();
    await page.mouse.wheel(0, 2400);
    expect(await page.getByText(text, { exact: true }).count()).toBeGreaterThan(0);
  }).toPass({ timeout: 120_000, intervals: [500] });
}

export const timelineScroller = (page: Page): Locator => page.locator('#timeline-scroller');

export async function timelineDistanceFromBottom(page: Page): Promise<number> {
  return timelineScroller(page).evaluate(
    (element) => element.scrollHeight - element.scrollTop - element.clientHeight
  );
}

export async function waitForTimelineScrollSettle(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const first = await timelineScroller(page).evaluate((element) => element.scrollTop);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
      );
      const second = await timelineScroller(page).evaluate((element) => element.scrollTop);
      return Math.abs(second - first);
    })
    .toBeLessThanOrEqual(1);
}

/** Waits for a rendered message's scroll container to settle at the live edge. */
export async function expectTimelineAtBottom(page: Page): Promise<void> {
  await expect
    .poll(() => timelineDistanceFromBottom(page), { timeout: 10_000 })
    .toBeLessThanOrEqual(2);
}
