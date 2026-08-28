import { readFile } from 'node:fs/promises';
import { test as teardown } from '@playwright/test';
import { removeContinuwuity } from './fixtures/continuwuity';
import { e2eHomeserverPath } from './fixtures/runtime';

teardown('remove homeserver', async ({ browserName }) => {
  let containerId: string;
  try {
    ({ containerId } = JSON.parse(await readFile(e2eHomeserverPath(), 'utf8')) as {
      containerId: string;
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await removeContinuwuity(containerId);
  void browserName;
});
