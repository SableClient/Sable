#!/usr/bin/env node
import { execFileSync, spawnSync } from 'child_process';
import { createConnection } from 'net';
import { readFileSync } from 'fs';

const { devDependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const version = devDependencies['@playwright/test'].replace(/^[^0-9]*/, '');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const name = 'sable-e2e-browser';
const port = 3000;

const waitForServer = () =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port })
        .on('connect', () => {
          socket.end();
          resolve();
        })
        .on('error', () => {
          if (Date.now() > deadline) {
            reject(new Error(`playwright server did not start on port ${port}`));
            return;
          }
          setTimeout(attempt, 500);
        });
    };
    attempt();
  });

const stop = () => spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });

stop();
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--detach',
    '--init',
    '--name',
    name,
    '--network',
    'host',
    '--workdir',
    '/home/pwuser',
    '--user',
    'pwuser',
    image,
    '/bin/sh',
    '-c',
    `npx -y playwright@${version} run-server --port ${port} --host 0.0.0.0`,
  ],
  { stdio: 'inherit' }
);

process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

await waitForServer();

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...args], {
  stdio: 'inherit',
  env: { ...process.env, PW_TEST_CONNECT_WS_ENDPOINT: `ws://127.0.0.1:${port}/` },
});

process.exit(result.status ?? 1);
