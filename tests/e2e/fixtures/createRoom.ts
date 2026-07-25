import { CreateRoomSurface } from '../pages/CreateRoomSurface';
import { test as base } from './test';

/** Adds the create-room surface on top of the shared app fixtures. */
export const test = base.extend<{ createRoom: CreateRoomSurface }>({
  createRoom: async ({ page }, use) => {
    await use(new CreateRoomSurface(page));
  },
});

export { expect } from '@playwright/test';
