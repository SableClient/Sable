#!/usr/bin/env node
//MISE description="Run Tauri CLI with platform-specific feature flags"
//USAGE arg "<platform>" help="Target" default="wry" choices "wry" "cef" "android" "ios"

import { run } from '@tauri-apps/cli';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'node:process';
import { PrefixedLogger, createTextHelpers } from './utils/console-style.js';

const logger = new PrefixedLogger('[tauri]');
const { dim } = createTextHelpers({ useColor: logger.useColor });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cmdlineArgs = process.argv.slice(2);

if (cmdlineArgs.length < 2) {
  logger.error('Usage: node scripts/tauri <platform> <command> [prepended-args...]');
  logger.error(`  ${dim('platform:')} wry, cef, android, or ios`);
  logger.error(`  ${dim('command:')} dev or build`);
  process.exit(1);
}

const [platform, cmd, ...tauriArgs] = cmdlineArgs;

const MOBILE = ['android', 'ios'];
const DESKTOP = ['wry', 'cef'];

if (![...DESKTOP, ...MOBILE].includes(platform)) {
  logger.error(`Invalid platform: ${platform}. Must be wry, cef, android, or ios`);
  process.exit(1);
}
if (!['dev', 'build'].includes(cmd)) {
  logger.error(`Invalid command: ${cmd}. Must be 'dev' or 'build'`);
  process.exit(1);
}

process.chdir(join(__dirname, '..'));

if (MOBILE.includes(platform)) {
  logger.info(`${dim('Running:')} tauri ${[platform, cmd, ...tauriArgs].join(' ')}`);
  const child = spawn('tauri', [platform, cmd, ...tauriArgs], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  const args = [cmd, '--features', `${platform},updater`, ...tauriArgs];
  if (!tauriArgs.includes('--')) {
    args.push('--');
  }
  args.push('--no-default-features');

  if (platform === 'cef' && cmd === 'build' && !tauriArgs.includes('--no-bundle')) {
    args.unshift('--no-bundle');
  }

  logger.info(`${dim('Running:')} tauri ${args.join(' ')}`);

  run(args, 'tauri').catch((error) => {
    logger.error(`Failed to run tauri: ${error?.message ?? error}`);
    process.exit(1);
  });
}
