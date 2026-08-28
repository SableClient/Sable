#!/usr/bin/env node
//MISE description="Download and verify the iOS XCFrameworks used by tauri-plugin-livekit-mobile"
// Downloads pinned iOS frameworks into src-tauri/Frameworks.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrefixedLogger } from './utils/console-style.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = new PrefixedLogger('[ios-frameworks]');

const FRAMEWORKS_DIR = resolve(__dirname, '../src-tauri/Frameworks');
const MANIFEST_PATH = join(FRAMEWORKS_DIR, '.manifest.json');

const FRAMEWORKS = [
  {
    name: 'LiveKitWebRTC',
    url: 'https://github.com/livekit/webrtc-xcframework/releases/download/144.7559.11/LiveKitWebRTC.xcframework.zip',
    sha256: '07c5caf718058af3c528dcabd257298c40e5a8527e4fb9f47c48336ba5899853',
  },
  {
    name: 'RustLiveKitUniFFI',
    url: 'https://github.com/livekit/livekit-uniffi-xcframework/releases/download/0.0.6/RustLiveKitUniFFI.xcframework.zip',
    sha256: '0d3f2ce159a224c728f8b131068d53bbf9b13d968cda0edc68a6a2290f2651ed',
  },
];

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeManifest(manifest) {
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function findExtractor() {
  for (const tool of ['ditto', 'unzip']) {
    if (!spawnSync(tool, ['--help'], { stdio: 'ignore' }).error) return tool;
  }
  throw new Error('Neither ditto nor unzip is available to extract XCFramework archives');
}

function extractZip(zipPath, destination) {
  const tool = findExtractor();
  const args =
    tool === 'ditto' ? ['-x', '-k', zipPath, destination] : ['-q', zipPath, '-d', destination];
  const result = spawnSync(tool, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${tool} failed to extract ${zipPath} (exit ${result.status})`);
  }
}

async function provision(framework, manifest) {
  const { name, url, sha256 } = framework;
  const target = join(FRAMEWORKS_DIR, `${name}.xcframework`);

  if (manifest[name] === sha256 && existsSync(join(target, 'Info.plist'))) {
    log.info(`${name}.xcframework already installed (verified), skipping`);
    return;
  }

  log.info(`Downloading ${name} from ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download ${name}: HTTP ${response.status} ${response.statusText}`);
  }
  const zipBuffer = Buffer.from(await response.arrayBuffer());

  const actual = sha256Hex(zipBuffer);
  if (actual !== sha256) {
    throw new Error(
      `Checksum mismatch for ${name}: expected ${sha256}, got ${actual}. Refusing to install.`
    );
  }
  log.info(`Verified SHA-256 for ${name}`);

  // Verify and unpack before replacing an existing framework.
  const tempDir = await mkdtemp(join(FRAMEWORKS_DIR, '.tmp-'));
  try {
    const zipPath = join(tempDir, `${name}.zip`);
    await writeFile(zipPath, zipBuffer);
    extractZip(zipPath, tempDir);

    const extracted = join(tempDir, `${name}.xcframework`);
    if (!existsSync(join(extracted, 'Info.plist'))) {
      throw new Error(
        `Downloaded archive for ${name} did not contain ${name}.xcframework; refusing to install.`
      );
    }

    if (existsSync(target)) {
      await rename(target, join(tempDir, '__replaced__'));
    }
    await rename(extracted, target);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  manifest[name] = sha256;
  await writeManifest(manifest);
  log.info(`Installed ${name}.xcframework`);
}

async function main() {
  await mkdir(FRAMEWORKS_DIR, { recursive: true });
  const manifest = await readManifest();
  for (const framework of FRAMEWORKS) {
    // oxlint-disable-next-line no-await-in-loop
    await provision(framework, manifest);
  }
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
