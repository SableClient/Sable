import { test as base } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

type Fixtures = {
  /** The signed-in app, already loaded and past the device banner. */
  app: AppShell;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    const app = new AppShell(page);
    await app.open();
    await use(app);
  },
});

export { expect } from '@playwright/test';
