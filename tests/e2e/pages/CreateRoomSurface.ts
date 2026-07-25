import type { Locator, Page } from '@playwright/test';

/**
 * The create-room shallow route. It presents as an overlay over the page it was
 * opened from on desktop, and as a full page on mobile or when deep linked —
 * so the surface itself looks the same either way and the difference is
 * whether the page behind it is still mounted.
 */
export class CreateRoomSurface {
  readonly title: Locator;

  readonly closeButton: Locator;

  constructor(readonly page: Page) {
    this.title = page.getByText('New Room').first();
    this.closeButton = page.getByRole('button', { name: 'Close create room' });
  }

  async gotoDirectly(): Promise<void> {
    await this.page.goto('/create-room');
  }
}
