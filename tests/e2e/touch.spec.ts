import { test, expect } from './fixtures/test';

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
    const sheet = page.locator('[class*="MessageMobileOptions"]').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
  });

  test('swipe-down dismisses a bottom sheet', async ({ app, page }) => {
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
    const sheetContainer = page.locator('[class*="MessageMobileOptions"]').first();
    await expect(sheetContainer).toBeVisible({ timeout: 5_000 });

    // The drag handle is at the top of the sheet (position: absolute, top: 0, height: 32px).
    // The sheet container is at the very bottom (position: fixed, bottom: 0).
    // Touch coordinates are relative to the viewport (clientX/clientY).
    // At max-height 85vh, the visible sheet top is at 15vh from viewport top, so drag
    // handle is roughly there. In a 915px viewport, ~137px from top. Use a reasonable
    // estimate: halfway up the sheet's likely visible area.
    const dragHandleY = 400; // upper portion of the sheet visible area
    const dragHandleX = page.viewportSize()?.width ? page.viewportSize()!.width / 2 : 206;

    // Touch the drag handle area
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        const realTarget = target ?? document.body;
        const touchStart = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: realTarget, clientX: x, clientY: y })],
        });
        realTarget.dispatchEvent(touchStart);
      },
      { x: dragHandleX, y: dragHandleY }
    );

    // Swipe down: move in increments and finally past >100px.
    // Sequential awaits are necessary — touchmove events must be dispatched
    // in order with pauses to simulate a real swipe gesture.
    const swipeDistance = 150;
    const steps = 5;
    // eslint-disable-next-line no-await-in-loop
    for (let i = 1; i <= steps; i++) {
      const progress = swipeDistance * (i / steps);
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate(
        ({ x, y, dy }) => {
          const target = document.elementFromPoint(x, y + dy);
          const realTarget = target ?? document.body;
          const touchMove = new TouchEvent('touchmove', {
            bubbles: true,
            cancelable: true,
            touches: [
              new Touch({ identifier: 1, target: realTarget, clientX: x, clientY: y + dy }),
            ],
          });
          realTarget.dispatchEvent(touchMove);
        },
        { x: dragHandleX, y: dragHandleY, dy: progress }
      );
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(30);
    }

    // End the touch gesture
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y + 150);
        const realTarget = target ?? document.body;
        const touchEnd = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [
            new Touch({ identifier: 1, target: realTarget, clientX: x, clientY: y + 150 }),
          ],
        });
        realTarget.dispatchEvent(touchEnd);
      },
      { x: dragHandleX, y: dragHandleY }
    );

    // The sheet should close — the container disappears
    await expect(sheetContainer).toBeHidden({ timeout: 3_000 });
  });

  test('settings page has no horizontal overflow', async ({ app, page }) => {
    // Confirm the client is loaded (app.open() has already waited for room list)
    await expect(app.room('General')).toBeVisible();

    // Navigate to the settings account page where the StatusEditor is
    await page.goto('/settings/account');

    // Wait for the settings page to render
    await expect(page.getByText('Settings')).toBeVisible({ timeout: 10_000 });

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
    await expect(page.getByText('Settings')).toBeVisible({ timeout: 10_000 });

    const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth2 = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth2).toBeLessThanOrEqual(clientWidth2);
  });
});
