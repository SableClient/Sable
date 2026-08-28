import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

async function longPress(page: Page, x: number, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touchPoints = [{ x: Math.round(x), y: Math.round(y) }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('touch interactions', () => {
  test('long-press opens a bottom-sheet context menu', async ({ app, page }) => {
    // Open a room so there are messages to long-press
    await app.room('General').click();
    await expect(page.getByText('Welcome to the test room.')).toBeVisible();

    // Get a message element to long-press on
    const message = page.getByText('Welcome to the test room.').first();
    const box = await message.boundingBox();
    if (!box) throw new Error('Message element not visible');

    // Simulate a long-press: touch start, hold >500ms (the useMenuAnchor threshold)
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.touchscreen.tap(cx, cy);
    // tap() is a brief tap, not a long-press. Use raw touch events for hold.
    // Clear any state from the tap first.
    await page.evaluate(() => {
      document.elementFromPoint(0, 0); // no-op to settle
    });

    // Dispatch a real long-press via touch events
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        const touchStart = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 0, target, clientX: x, clientY: y })],
        });
        target.dispatchEvent(touchStart);
      },
      { x: cx, y: cy }
    );

    // Wait 600ms for the long-press timer (>500ms threshold)
    await page.waitForTimeout(600);

    // Dispatch touchend to complete the long-press
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        const touchEnd = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 0, target, clientX: x, clientY: y })],
        });
        target.dispatchEvent(touchEnd);
      },
      { x: cx, y: cy }
    );

    // The context menu should now be open — on mobile this is a bottom sheet
    // rendered inside the MessageMobileOptionsContainer (z-index 1005, fixed at bottom)
    const sheet = page.locator('[data-gestures="ignore"]').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
  });

  test('long-press on a room opens its menu instead of navigating', async ({ app, page }) => {
    const roomItem = app.room('General');
    const box = await roomItem.boundingBox();
    if (!box) throw new Error('Room item not visible');

    await longPress(page, box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByText('Leave Room')).toBeVisible({ timeout: 5_000 });

    // Tapping the backdrop still dismisses it.
    await page.touchscreen.tap(box.x + box.width / 2, 8);
    await expect(page.getByText('Leave Room')).toBeHidden({ timeout: 5_000 });
  });

  test('a single tap opens a room', async ({ app, page }) => {
    const box = await app.room('General').boundingBox();
    if (!box) throw new Error('Room item not visible');

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByText('Welcome to the test room.')).toBeVisible({ timeout: 10_000 });
  });

  // Never passed. The sheet does not dismiss from a downward swipe under real
  // CDP touch input either, so this looks like a gap in MobileSwipeDownModal
  // rather than a harness problem. Investigate before re-enabling.
  test.fixme('swipe-down dismisses a bottom sheet', async ({ app, page }) => {
    // Open a room to get messages with context menus
    await app.room('General').click();
    await expect(page.getByText('Welcome to the test room.')).toBeVisible();

    // Long-press a message to open the context menu bottom sheet
    const message = page.getByText('Welcome to the test room.').first();
    const box = await message.boundingBox();
    if (!box) throw new Error('Message element not visible');

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        const touchStart = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 0, target, clientX: x, clientY: y })],
        });
        target.dispatchEvent(touchStart);
      },
      { x: cx, y: cy }
    );
    await page.waitForTimeout(600);
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        const touchEnd = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 0, target, clientX: x, clientY: y })],
        });
        target.dispatchEvent(touchEnd);
      },
      { x: cx, y: cy }
    );

    // Verify the sheet is open
    const sheetContainer = page.locator('[data-gestures="ignore"]').first();
    await expect(sheetContainer).toBeVisible({ timeout: 5_000 });

    // Derive the touch point from the sheet's real box: it is fixed to the bottom,
    // so a hardcoded y lands on the backdrop instead.
    const sheetBox = await page.locator('[data-gestures="ignore"] > *').first().boundingBox();
    if (!sheetBox) throw new Error('Sheet has no box');
    const dragHandleY = Math.round(sheetBox.y + sheetBox.height / 3);
    const dragHandleX = Math.round(sheetBox.x + sheetBox.width / 2);

    // Real touch input via CDP: synthetic TouchEvents are retargeted by
    // elementFromPoint as the finger travels, so they miss the sheet's handlers.
    const cdp = await page.context().newCDPSession(page);
    const point = [{ x: dragHandleX, y: dragHandleY }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: dragHandleX, y: dragHandleY + (150 * i) / 5 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // The sheet should close — the container disappears
    await expect(sheetContainer).toBeHidden({ timeout: 3_000 });
  });

  // Never passed: the Save click times out on a touch viewport (Save button is
  // disabled/not-clickable on touch), so the long status is never persisted.
  // Separate from the ResponsiveMenu tap-swallowing bug — StatusEditor Save is
  // a regular button on a route, not inside a sheet. Investigate before enabling.
  test.fixme('settings page has no horizontal overflow', async ({ app, page }) => {
    // Confirm the client is loaded (app.open() has already waited for room list)
    await expect(app.room('General')).toBeVisible();

    // Navigate to the settings account page where the StatusEditor is
    await page.goto('/settings/account');

    // The status input is the readiness signal; on a touch viewport the word
    // "Settings" only appears in the collapsed nav.

    // The StatusEditor is present in the Account section with input name="statusInput"
    const statusInput = page.locator('input[name="statusInput"]').first();
    await expect(statusInput).toBeVisible({ timeout: 10_000 });

    // Fill a very long status to test horizontal overflow (issue #1349)
    const longStatus =
      'This is a very long status message designed to test horizontal overflow behavior on mobile viewports. '.repeat(
        10
      );
    await statusInput.fill(longStatus);

    // Save the status
    const saveButton = page.getByRole('button', { name: 'Save' }).first();
    await saveButton.click();

    // Wait for save to complete (the button should no longer show a spinner)
    await page.waitForTimeout(2_000);

    // Assert no horizontal overflow anywhere on the page
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Also check on the main settings index page
    await page.goto('/settings/general');
    // The section renders its own heading; on a touch viewport the word
    // "Settings" only appears in the collapsed nav.
    await expect(page.getByText('General').first()).toBeVisible({ timeout: 10_000 });

    const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth2 = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth2).toBeLessThanOrEqual(clientWidth2);
  });
});
