import { test, expect } from './fixtures/createRoom';

test.describe('create room surface', () => {
  test('desktop opens it over the page it was launched from', async ({
    app,
    createRoom,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');

    await app.createRoomButton.click();

    await expect(page).toHaveURL(/\/create-room$/);
    await expect(createRoom.title).toBeVisible();
    // The room list stays mounted behind the overlay.
    await expect(app.room('General')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(createRoom.title).toBeHidden();
  });

  test('mobile opens it as a full page', async ({ app, createRoom }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile');

    await createRoom.gotoDirectly();

    await expect(createRoom.title).toBeVisible();
    await expect(createRoom.closeButton).toBeVisible();
    await expect(app.room('General')).toBeHidden();
  });

  test('deep linking on desktop renders the full page, not an overlay', async ({
    app,
    createRoom,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');

    await createRoom.gotoDirectly();

    await expect(createRoom.title).toBeVisible();
    // No background was recorded, so it replaces the page rather than sitting over it.
    await expect(app.room('General')).toBeHidden();
  });

  test('browser back closes a surface opened over a page', async ({
    app,
    createRoom,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');

    await app.createRoomButton.click();
    await expect(page).toHaveURL(/\/create-room$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(createRoom.title).toBeHidden();
  });
});
