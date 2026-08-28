import { join } from 'node:path';

const fallbackPort = '4175';

const appPort = () => fallbackPort;

export const e2eBaseUrl = () => `http://127.0.0.1:${appPort()}`;

export const e2eStorageStatePath = () => join('tests/e2e/.auth', `state-${appPort()}.json`);

export const e2eHomeserverPath = () => join('tests/e2e/.auth', `homeserver-${appPort()}.json`);
