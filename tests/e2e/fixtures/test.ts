import { test as base } from '@playwright/test';
import { AppShell } from '../pages/AppShell';
import { CreateRoomSurface } from '../pages/CreateRoomSurface';

type Fixtures = {
  /** The signed-in app, already loaded and past the device banner. */
  app: AppShell;
  createRoom: CreateRoomSurface;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    const app = new AppShell(page);
    await app.open();
    await use(app);
  },

  createRoom: async ({ page }, use) => {
    await use(new CreateRoomSurface(page));
  },
});

export { expect } from '@playwright/test';
