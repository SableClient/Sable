#!/usr/bin/env node
//MISE description="Run Tauri CLI"
//MISE depends="tauri:setup"
//MISE raw_args=true

/**
 * Passes through to the Tauri CLI. When the first argument is a desktop runtime
 * (`wry` or `cef`) and the second is `dev` or `build`, injects the appropriate
 * Cargo feature flags (`--features <runtime>,updater --no-default-features`).
 * Everything else is forwarded to `tauri` as-is.
 *
 *   script/tauri cef dev --verbose
 *     → tauri dev --features cef,updater -- --verbose --no-default-features
 */

import { run } from '@tauri-apps/cli';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'node:process';
import { PrefixedLogger, createTextHelpers } from './utils/console-style.js';

const logger = new PrefixedLogger('[tauri]');
const { dim } = createTextHelpers({ useColor: logger.useColor });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cmdlineArgs = process.argv.slice(2);
process.chdir(join(__dirname, '..'));

const DESKTOP = ['wry', 'cef'];

function runTauri(args) {
  logger.info(`${dim('Running:')} tauri ${args.join(' ')}`);
  run(args, 'tauri').catch((error) => {
    logger.error(`Failed to run tauri: ${error?.message ?? error}`);
    process.exit(1);
  });
}

if (cmdlineArgs.length === 0 || !DESKTOP.includes(cmdlineArgs[0])) {
  runTauri(cmdlineArgs);
  process.exit(0);
}

const [platform, cmd, ...tauriArgs] = cmdlineArgs;

if (!cmd) {
  runTauri(cmdlineArgs);
  process.exit(0);
}

if (!['dev', 'build'].includes(cmd)) {
  runTauri([cmd, ...tauriArgs]);
  process.exit(0);
}

const args = [cmd, '--features', `${platform},updater`, ...tauriArgs];
if (!tauriArgs.includes('--')) {
  args.push('--');
}
args.push('--no-default-features');

if (platform === 'cef' && cmd === 'build' && !tauriArgs.includes('--no-bundle')) {
  args.splice(1, 0, '--no-bundle');
}

runTauri(args);
