import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test as setup } from '@playwright/test';
import { startContinuwuity } from './fixtures/continuwuity';
import { LOGIN_PASSWORD, LOGIN_USERNAME } from './fixtures/loginAccount';
import { e2eBaseUrl, e2eHomeserverPath, e2eStorageStatePath } from './fixtures/runtime';
import { createSeededStorageState } from './fixtures/session';

setup('provision homeserver', async ({ browserName }) => {
  const authPath = e2eStorageStatePath();
  const hs = await startContinuwuity();

  await hs.register(LOGIN_USERNAME, LOGIN_PASSWORD);
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(
    authPath,
    JSON.stringify(
      await createSeededStorageState(hs.baseUrl, e2eBaseUrl(), `bootstrap-${browserName}`)
    )
  );
  await writeFile(e2eHomeserverPath(), JSON.stringify({ containerId: hs.containerId }));
});
