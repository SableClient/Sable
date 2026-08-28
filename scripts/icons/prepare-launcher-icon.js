#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const flavor = process.env.SABLE_LAUNCHER_ICON;

if (!flavor) process.exit(0);
if (!['dev', 'nightly'].includes(flavor)) {
  console.error(`Unknown launcher icon flavor: ${flavor}`);
  process.exit(1);
}

const root = process.cwd();
const icons = path.join(root, 'src-tauri', 'icons');
const output = path.join(icons, 'generated', flavor);
const buildIcons = path.join(icons, 'build-icons');

const androidSource = path.join(buildIcons, `${flavor}.svg`);
const iosSource = path.join(buildIcons, `${flavor}-ios.svg`);
const iosScratch = path.join(output, '.ios-pass');

function generate(source, out) {
  if (!existsSync(source)) {
    console.error(`Launcher icon source not found: ${source}`);
    process.exit(1);
  }

  const result = spawnSync('pnpm', ['tauri', 'icon', source, '--output', out], {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

generate(androidSource, output);
generate(iosSource, iosScratch);

rmSync(path.join(output, 'ios'), { recursive: true, force: true });
renameSync(path.join(iosScratch, 'ios'), path.join(output, 'ios'));
rmSync(iosScratch, { recursive: true, force: true });

['mipmap-anydpi-v26/ic_launcher.xml', 'values/ic_launcher_background.xml'].forEach((file) => {
  copyFileSync(path.join(icons, 'android', file), path.join(output, 'android', file));
});
