import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * How long the Matrix client may take to sync and paint the room list. One
 * definition so a cold start and a warm one are held to the same bar.
 */
export const CLIENT_READY_TIMEOUT = 30_000;

/** The signed-in app: room list, rail, and the menus reachable from them. */
export class AppShell {
  readonly leaveRoomPrompt: Locator;

  readonly createRoomButton: Locator;

  constructor(readonly page: Page) {
    this.leaveRoomPrompt = page.getByText('Are you sure you want to leave this room?');
    this.createRoomButton = page.getByRole('button', { name: 'Create Room' }).first();
  }

  /** Loads the app and waits until the seeded rooms are on screen. */
  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.room('General')).toBeVisible({ timeout: CLIENT_READY_TIMEOUT });
    await this.dismissDeviceBanner();
  }

  room(name: string): Locator {
    return this.page.getByText(name).first();
  }

  /** The unverified-device banner is not always present, so this is best effort. */
  async dismissDeviceBanner(): Promise<void> {
    await this.page
      .getByRole('button', { name: 'Dismiss' })
      .click({ timeout: 5_000 })
      .catch(() => undefined);
  }

  async openRoomOptions(name: string): Promise<RoomOptionsMenu> {
    await this.room(name).hover();
    await this.page.getByRole('button', { name: 'More Options' }).first().click();
    return new RoomOptionsMenu(this.page);
  }
}

export class RoomOptionsMenu {
  constructor(readonly page: Page) {}

  async leaveRoom(): Promise<void> {
    // The mobile sheet can overflow the viewport, where a real pointer click fails.
    await this.page.getByRole('button', { name: 'Leave Room' }).dispatchEvent('click');
  }
}
