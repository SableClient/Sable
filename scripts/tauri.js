#!/usr/bin/env node

/**
 * Script to run tauri commands for a given runtime (wry or cef) with prepended CLI args.
 *
 * Usage:
 *   script/tauri <runtime> <command> [prepended-args...]
 *
 * Examples:
 *   script/tauri cef dev --verbose
 *   script/tauri cef dev -- --verbose
 *   Both will run: cargo tauri dev --features cef -- --verbose --no-default-features
 */

import { spawn } from 'child_process';
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
  logger.error('Usage: node scripts/tauri <runtime> <command> [prepended-args...]');
  logger.error(`  ${dim('command:')} dev or build`);
  logger.error(`  ${dim('runtime:')} wry or cef`);
  logger.error(
    `  ${dim('prepended-args:')} Arguments to prepend to the cargo args (-- separator is optional)`
  );
  process.exit(1);
}

const [runtime, cmd, ...tauriArgs] = cmdlineArgs;

if (!['wry', 'cef'].includes(runtime)) {
  logger.error(`Invalid runtime: ${runtime}. Must be 'wry' or 'cef'`);
  process.exit(1);
}
if (!['dev', 'build'].includes(cmd)) {
  logger.error(`Invalid command: ${cmd}. Must be 'dev' or 'build'`);
  process.exit(1);
}

tauriArgs.unshift('--features', runtime);
if (!tauriArgs.includes('--')) {
  tauriArgs.push('--');
}
tauriArgs.push('--no-default-features');

const args = ['tauri', cmd, ...tauriArgs];

const command = 'cargo';

logger.info(`${dim('Running:')} ${command} ${args.join(' ')}`);

// Spawn the tauri process
const proc = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
  cwd: join(__dirname, '..'),
});

proc.on('error', (error) => {
  logger.error(`Failed to start process: ${error.message}`);
  process.exit(1);
});

proc.on('exit', (code) => {
  process.exit(code ?? 0);
});
