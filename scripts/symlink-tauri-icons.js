#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createTextHelpers } from './utils/console-style.js';

const ANDROID_ICONS = [
  'mipmap-hdpi',
  'mipmap-mdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi',
]
  .flatMap((dir) => [
    `${dir}/ic_launcher.png`,
    `${dir}/ic_launcher_round.png`,
    `${dir}/ic_launcher_foreground.png`,
  ])
  .concat(['mipmap-anydpi-v26/ic_launcher.xml', 'values/ic_launcher_background.xml']);

const IOS_ICONS = [
  'AppIcon-20x20@1x.png',
  'AppIcon-20x20@2x.png',
  'AppIcon-20x20@2x-1.png',
  'AppIcon-20x20@3x.png',
  'AppIcon-29x29@1x.png',
  'AppIcon-29x29@2x.png',
  'AppIcon-29x29@2x-1.png',
  'AppIcon-29x29@3x.png',
  'AppIcon-40x40@1x.png',
  'AppIcon-40x40@2x.png',
  'AppIcon-40x40@2x-1.png',
  'AppIcon-40x40@3x.png',
  'AppIcon-60x60@2x.png',
  'AppIcon-60x60@3x.png',
  'AppIcon-76x76@1x.png',
  'AppIcon-76x76@2x.png',
  'AppIcon-83.5x83.5@2x.png',
  'AppIcon-512@2x.png',
];

function parseArgs(argv) {
  let write = false;
  let force = false;

  argv.forEach((arg) => {
    if (arg === '--write') write = true;
    if (arg === '--force') force = true;
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: node scripts/symlink-icons.js [--write] [--force]',
          '',
          'Default mode is dry-run.',
          '--write      Apply changes (create symlinks).',
          '--force      Overwrite existing symlinks.',
        ].join('\n')
      );
      process.exit(0);
    }
  });

  return { write, force };
}

function createSymlink(src, dest, write, force, helpers) {
  const { dim, red, green } = helpers;

  if (!fs.existsSync(src)) {
    console.log(`  ${red('!')}  ${dim('source missing, skipping:')} ${src}`);
    return false;
  }

  const exists = fs.existsSync(dest);
  if (exists && !force) {
    console.log(
      `  ${dim('~')}  ${dim(path.relative(process.cwd(), dest))} ${dim('(exists, skipping)')}`
    );
    return false;
  }

  if (write) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    try {
      fs.unlinkSync(dest);
    } catch {
      // dest does not exist — nothing to remove
    }

    const rel = path.relative(path.dirname(dest), src).split(path.sep).join('/');
    fs.symlinkSync(rel, dest);
  }

  console.log(`  ${green('+')}  ${dim(path.relative(process.cwd(), dest))}`);
  return true;
}

function processGroup(label, srcDir, destDir, files, write, force, helpers) {
  const { dim, red } = helpers;

  if (!fs.existsSync(destDir)) {
    console.log(`\n${label}: ${red('destination not found')}, skipping.\n  ${dim(destDir)}`);
    return;
  }

  console.log(`\n${label}`);

  const results = files.map((file) => {
    try {
      return createSymlink(
        path.join(srcDir, file),
        path.join(destDir, file),
        write,
        force,
        helpers
      );
    } catch (err) {
      console.log(`  ${red('-')}  ${file}: ${err.message}`);
      return false;
    }
  });

  const ok = results.filter(Boolean).length;
  const verb = write ? 'created' : 'would create';
  console.log(`  ${dim(`→ ${ok}/${files.length} symlinks ${verb}.`)}`);
}

function main() {
  const ROOT = process.cwd();
  const { write, force } = parseArgs(process.argv.slice(2));
  const helpers = createTextHelpers();

  processGroup(
    'Android',
    path.join(ROOT, 'src-tauri', 'icons', 'android'),
    path.join(ROOT, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res'),
    ANDROID_ICONS,
    write,
    force,
    helpers
  );

  processGroup(
    'iOS',
    path.join(ROOT, 'src-tauri', 'icons', 'ios'),
    path.join(ROOT, 'src-tauri', 'gen', 'apple', 'Assets.xcassets', 'AppIcon.appiconset'),
    IOS_ICONS,
    write,
    force,
    helpers
  );

  const mode = write ? 'Applied' : 'Dry run';
  console.log(`\n${mode}.`);
  if (!write) console.log('Re-run with --write to apply changes.');
}

main();
