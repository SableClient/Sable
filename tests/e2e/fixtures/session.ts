import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { createRoom, registerUser, sendText, type RegisteredUser } from './continuwuity';

export const PASSWORD = 'test-passw0rd';

export type InjectedSession = {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  slidingSyncOptIn?: boolean;
};

type StorageState = {
  cookies: [];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
};

export async function createSeededStorageState(
  baseUrl: string,
  origin: string,
  username: string
): Promise<StorageState> {
  const user = await registerUser(baseUrl, username, PASSWORD);
  const general = await createRoom(baseUrl, user.accessToken, {
    name: 'General',
    preset: 'private_chat',
  });
  await sendText(baseUrl, user.accessToken, general, 'Welcome to the test room.', 1);
  await sendText(baseUrl, user.accessToken, general, 'Layout baseline seed message.', 2);

  const random = await createRoom(baseUrl, user.accessToken, {
    name: 'Random',
    preset: 'private_chat',
  });
  await sendText(baseUrl, user.accessToken, random, 'Another seeded room.', 1);

  await createRoom(baseUrl, user.accessToken, {
    name: 'Test Space',
    preset: 'private_chat',
    creation_content: { type: 'm.space' },
  });

  const session: InjectedSession = {
    baseUrl,
    userId: user.userId,
    deviceId: user.deviceId,
    accessToken: user.accessToken,
  };

  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: 'matrixSessions', value: JSON.stringify([session]) },
          { name: 'matrixActiveSession', value: JSON.stringify(session.userId) },
        ],
      },
    ],
  };
}

/** Reads the homeserver the global setup provisioned out of the saved storage state. */
export async function homeserverBaseUrl(storageStatePath: string): Promise<string> {
  const state = JSON.parse(await readFile(storageStatePath, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const entry = state.origins[0]!.localStorage.find((item) => item.name === 'matrixSessions')!;
  return (JSON.parse(entry.value) as InjectedSession[])[0]!.baseUrl;
}

/**
 * Registers a throwaway account and injects its session before first paint, so a
 * test starts from a known-empty account instead of the shared login fixture.
 */
export async function loginAsFreshUser(
  page: Page,
  baseUrl: string,
  name: string,
  slidingSyncOptIn = true
): Promise<RegisteredUser> {
  const user = await registerUser(baseUrl, name, PASSWORD);
  const session: InjectedSession = {
    baseUrl,
    userId: user.userId,
    deviceId: user.deviceId,
    accessToken: user.accessToken,
    slidingSyncOptIn,
  };
  await page.addInitScript((injected: InjectedSession) => {
    localStorage.setItem('matrixSessions', JSON.stringify([injected]));
    localStorage.setItem('matrixActiveSession', JSON.stringify(injected.userId));
    localStorage.setItem('dismissNotice', 'true');
  }, session);
  return user;
}
