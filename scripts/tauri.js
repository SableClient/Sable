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
 *
 * Pass `--no-updater` to omit the bundled auto-updater, for distro packagers and
 * anyone building from source who updates through their own channel:
 *
 *   script/tauri wry build --no-updater
 *     → tauri build --features wry -- --no-default-features
 */

import { run } from '@tauri-apps/cli';
import { execFileSync } from 'node:child_process';
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

const DESKTOP = new Set(['wry', 'cef']);

async function runTauri(args) {
  logger.info(`${dim('Running:')} tauri ${args.join(' ')}`);
  try {
    await run(args, 'tauri');
  } catch (error) {
    logger.error(`Failed to run tauri: ${error?.message ?? error}`);
    process.exit(1);
  }
}

function resolveCefPath() {
  if (process.env.CEF_PATH) {
    logger.info(`${dim('Using CEF_PATH from environment:')} ${process.env.CEF_PATH}`);
    return;
  }
  if (process.platform !== 'linux') return;
  try {
    const cefPath = execFileSync(join(__dirname, 'fetch-cef.sh'), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim();
    process.env.CEF_PATH = cefPath;
    logger.info(`${dim('CEF_PATH:')} ${cefPath}`);
  } catch (error) {
    logger.error(`Failed to fetch CEF: ${error?.message ?? error}`);
    process.exit(1);
  }
}

async function main() {
  if (cmdlineArgs.length === 0 || !DESKTOP.has(cmdlineArgs[0])) {
    return runTauri(cmdlineArgs);
  }

  const [platform, cmd, ...rawTauriArgs] = cmdlineArgs;

  if (!cmd) {
    return runTauri(cmdlineArgs);
  }

  if (!['dev', 'build'].includes(cmd)) {
    return runTauri([cmd, ...rawTauriArgs]);
  }

  // Consumed here, not forwarded: the tauri CLI does not know this flag.
  const noUpdater = rawTauriArgs.includes('--no-updater');
  const tauriArgs = rawTauriArgs.filter((arg) => arg !== '--no-updater');
  if (noUpdater) {
    logger.info('Building without the auto-updater (--no-updater)');
  }

  // The frontend is built before Cargo, so mirror the updater feature into Vite.
  process.env.VITE_DESKTOP_UPDATER_ENABLED = String(!noUpdater);

  const base = noUpdater ? platform : `${platform},updater`;
  const features = `${base},matrix-crypto`;
  const args = [cmd, '--features', features, ...tauriArgs];
  if (!tauriArgs.includes('--')) {
    args.push('--');
  }
  args.push('--no-default-features');

  if (noUpdater && cmd === 'build') {
    // Signed updater artifacts would otherwise demand TAURI_SIGNING_PRIVATE_KEY.
    args.splice(1, 0, '--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  }

  if (platform === 'cef' && cmd === 'build' && !tauriArgs.includes('--no-bundle')) {
    args.splice(1, 0, '--no-bundle');
  }

  if (platform === 'cef') {
    resolveCefPath();
  }

  return runTauri(args);
}

main();
