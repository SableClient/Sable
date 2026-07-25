import { test, expect } from './fixtures/test';

test('leave room prompt opens from the room options menu', async ({ app }) => {
  const menu = await app.openRoomOptions('General');
  await menu.leaveRoom();

  await expect(app.leaveRoomPrompt).toBeVisible();
});
