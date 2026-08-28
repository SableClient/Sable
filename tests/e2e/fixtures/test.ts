import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test as base } from '@playwright/test';
import { AppShell } from '../pages/AppShell';
import { e2eBaseUrl, e2eStorageStatePath } from './runtime';
import { createSeededStorageState, homeserverBaseUrl } from './session';

type Fixtures = {
  app: AppShell;
};

type WorkerFixtures = {
  workerStorageState: string;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState);
  },
  workerStorageState: [
    async ({ browserName }, use, workerInfo) => {
      const storageStatePath = join(
        workerInfo.project.outputDir,
        '.auth',
        `${workerInfo.parallelIndex}.json`
      );
      const exists = await access(storageStatePath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await use(storageStatePath);
        return;
      }
      await mkdir(dirname(storageStatePath), { recursive: true });
      await writeFile(
        storageStatePath,
        JSON.stringify(
          await createSeededStorageState(
            await homeserverBaseUrl(e2eStorageStatePath()),
            e2eBaseUrl(),
            `worker-${workerInfo.project.name}-${browserName}-${workerInfo.parallelIndex}`
          )
        )
      );
      await use(storageStatePath);
    },
    { scope: 'worker' },
  ],
  app: async ({ page }, use) => {
    const app = new AppShell(page);
    await app.open();
    await use(app);
  },
});

export { expect } from '@playwright/test';
