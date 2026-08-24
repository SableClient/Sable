#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const flavor = process.env.SABLE_LAUNCHER_ICON;

if (!flavor) process.exit(0);
if (!['dev', 'nightly'].includes(flavor)) {
  console.error(`Unknown launcher icon flavor: ${flavor}`);
  process.exit(1);
}

const root = process.cwd();
const output = path.join(root, 'src-tauri', 'icons', 'generated', flavor);
const source = path.join(root, 'src-tauri', 'icons', 'build-icons', `${flavor}.svg`);

if (!existsSync(source)) {
  console.error(`Launcher icon source not found: ${source}`);
  process.exit(1);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const result = spawnSync('pnpm', ['tauri', 'icon', source, '--output', output], {
  cwd: root,
  stdio: 'inherit',
});

if (result.status !== 0) process.exit(result.status ?? 1);
