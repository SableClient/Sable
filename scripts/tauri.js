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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { delimiter, dirname, join, resolve } from 'path';
import process from 'node:process';
import { PrefixedLogger, createTextHelpers } from './utils/console-style.js';

const logger = new PrefixedLogger('[tauri]');
const { dim } = createTextHelpers({ useColor: logger.useColor });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cmdlineArgs = process.argv.slice(2);
process.chdir(join(__dirname, '..'));

const DESKTOP = new Set(['wry', 'cef']);
const DEFAULT_XCODE_DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer';

function normalizeDeveloperDir(value) {
  const path = resolve(value);
  return path.endsWith('.app') ? join(path, 'Contents', 'Developer') : path;
}

function isFullXcodeDeveloperDir(developerDir) {
  return (
    existsSync(join(developerDir, 'usr', 'bin', 'xcodebuild')) &&
    existsSync(join(developerDir, 'Platforms', 'MacOSX.platform', 'Developer', 'SDKs'))
  );
}

function failMacOSToolchain(reason) {
  logger.error(
    `${reason} Install full Xcode or set DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer.`,
  );
  process.exit(1);
}

function configureMacOSToolchain() {
  if (process.platform !== 'darwin') {
    return;
  }

  const configuredDeveloperDir = process.env.DEVELOPER_DIR?.trim();
  let developerDir;
  if (configuredDeveloperDir) {
    developerDir = normalizeDeveloperDir(configuredDeveloperDir);
    if (!isFullXcodeDeveloperDir(developerDir)) {
      failMacOSToolchain(`Full Xcode was not found at DEVELOPER_DIR=${configuredDeveloperDir}.`);
    }
  } else {
    let selectedDeveloperDir;
    try {
      selectedDeveloperDir = execFileSync(
        '/usr/bin/xcode-select',
        ['--print-path'],
        { encoding: 'utf8' },
      ).trim();
    } catch {
      selectedDeveloperDir = '';
    }

    const candidates = [selectedDeveloperDir, DEFAULT_XCODE_DEVELOPER_DIR]
      .filter(Boolean)
      .map(normalizeDeveloperDir);
    developerDir = candidates.find(isFullXcodeDeveloperDir);
    if (!developerDir) {
      failMacOSToolchain(
        'Full Xcode was not found at the selected developer directory or /Applications/Xcode.app.',
      );
    }
  }

  let sdkRoot;
  try {
    sdkRoot = execFileSync(
      '/usr/bin/xcrun',
      ['--sdk', 'macosx', '--show-sdk-path'],
      {
        encoding: 'utf8',
        env: { ...process.env, DEVELOPER_DIR: developerDir },
      },
    ).trim();
  } catch {
    failMacOSToolchain(`Unable to resolve the macOS SDK from DEVELOPER_DIR=${developerDir}.`);
  }
  if (!sdkRoot || !existsSync(sdkRoot)) {
    failMacOSToolchain(`The macOS SDK was not found from DEVELOPER_DIR=${developerDir}.`);
  }

  process.env.DEVELOPER_DIR = developerDir;
  process.env.SDKROOT = sdkRoot;
  process.env.PATH = [join(__dirname, 'macos-bin'), process.env.PATH]
    .filter(Boolean)
    .join(delimiter);
}

function injectMacOSDevFeature(args) {
  if (process.platform !== 'darwin' || args[0] !== 'dev') {
    return args;
  }

  const feature = 'notifications-dev';
  const separatorIndex = args.indexOf('--');
  const featureArgsEnd = separatorIndex === -1 ? args.length : separatorIndex;
  const appendFeature = (value) =>
    value.split(',').includes(feature) ? value : value ? `${value},${feature}` : feature;

  for (let index = 0; index < featureArgsEnd; index += 1) {
    if (args[index] === '--features' && index + 1 < featureArgsEnd) {
      const featureValue = args[index + 1];
      if (featureValue.split(',').includes(feature)) {
        return args;
      }
      return [...args.slice(0, index + 1), appendFeature(featureValue), ...args.slice(index + 2)];
    }
    if (args[index].startsWith('--features=')) {
      const featureValue = args[index].slice('--features='.length);
      if (featureValue.split(',').includes(feature)) {
        return args;
      }
      return [
        ...args.slice(0, index),
        `--features=${appendFeature(featureValue)}`,
        ...args.slice(index + 1),
      ];
    }
  }

  return [
    ...args.slice(0, featureArgsEnd),
    '--features',
    feature,
    ...args.slice(featureArgsEnd),
  ];
}

async function runTauri(args) {
  logger.info(`${dim('Running:')} tauri ${args.join(' ')}`);
  try {
    await run(args, 'tauri');
  } catch (error) {
    logger.error(`Failed to run tauri: ${error?.message ?? error}`);
    process.exit(1);
  }
}

async function main() {
  configureMacOSToolchain();

  if (cmdlineArgs.length === 0 || !DESKTOP.has(cmdlineArgs[0])) {
    return runTauri(injectMacOSDevFeature(cmdlineArgs));
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

  const features = noUpdater ? platform : `${platform},updater`;
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

  return runTauri(injectMacOSDevFeature(args));
}

main();
