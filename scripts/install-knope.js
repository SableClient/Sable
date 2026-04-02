#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import { PrefixedLogger, createTextHelpers } from './utils/console-style.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERSION = '0.22.4';
/**
 * @typedef {'linux-x64' | 'linux-arm64' | 'darwin-x64' | 'darwin-arm64' | 'win32-x64'} SupportedTargetKey
 */

/**
 * Pinned to the published release asset digests for knope.
 * Source: GitHub release asset metadata at publish time.
 * @type {Record<SupportedTargetKey, { target: string; digest: string }>}
 */
const TARGETS = {
  'linux-x64': {
    target: 'x86_64-unknown-linux-musl',
    digest: 'sha256:45a74925ae9f4c9c2c33b51992ae50241ec4fa836bf8d2977c0b8e8172dd69cf',
  },
  'linux-arm64': {
    target: 'aarch64-unknown-linux-musl',
    digest: 'sha256:95e882afdb4154c5baaba91f7bbd1fb1d41cec6898363a2b30e7abad4057b83b',
  },
  'darwin-x64': {
    target: 'x86_64-apple-darwin',
    digest: 'sha256:010dc197bf159bbd9d60e897252248ba2b0e204beae7250ce54a9deae1ec4876',
  },
  'darwin-arm64': {
    target: 'aarch64-apple-darwin',
    digest: 'sha256:02131f284315c8ece8a4ef69a0aff5f658309d4df73b95cfdfbe0fbd9e9ce259',
  },
  'win32-x64': {
    target: 'x86_64-pc-windows-msvc',
    digest: 'sha256:09f735b2da42cd594189042d1379c0a3a350a8c0ccb741015a84c6ff334543b1',
  },
};

/**
 * @param {string | null | undefined} output
 * @returns {string | null}
 */
function parseKnopeVersion(output) {
  const version = output?.trim().replace(/^knope\s+/, '');
  return version || null;
}

/**
 * @param {string} command
 * @returns {string | null}
 */
function getKnopeVersion(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  return parseKnopeVersion(result.stdout);
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function readNullTerminatedString(buffer) {
  const nulIndex = buffer.indexOf(0);
  const end = nulIndex === -1 ? buffer.length : nulIndex;
  return buffer.toString('utf8', 0, end);
}

/**
 * @param {string} entryName
 * @returns {string}
 */
function getTarBasename(entryName) {
  const segments = entryName.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

/**
 * @param {Buffer} tarBuffer
 * @param {string} expectedBasename
 * @returns {Buffer}
 */
function extractRegularFileFromTar(tarBuffer, expectedBasename) {
  let offset = 0;
  const regularEntries = [];

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readNullTerminatedString(header.subarray(0, 100));
    const prefix = readNullTerminatedString(header.subarray(345, 500));
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeOctal = readNullTerminatedString(header.subarray(124, 136)).trim();
    const size = sizeOctal ? Number.parseInt(sizeOctal, 8) : 0;
    const typeflag = header[156];
    const isRegular = typeflag === 0 || typeflag === 48;

    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`Invalid tar entry size for ${fullName || '<unknown>'}`);
    }

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tarBuffer.length) {
      throw new Error('Corrupt tarball: entry exceeds archive size');
    }

    if (isRegular && fullName) {
      regularEntries.push(fullName);
      if (getTarBasename(fullName) === expectedBasename) {
        return Buffer.from(tarBuffer.subarray(dataStart, dataEnd));
      }
    }

    const alignedSize = Math.ceil(size / 512) * 512;
    offset = dataStart + alignedSize;
  }

  throw new Error(
    `Expected "${expectedBasename}" in tarball; found: ${regularEntries.join(', ') || 'none'}`
  );
}

/**
 * @returns {string | null}
 */
function getSystemKnopePath() {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['knope'], {
    encoding: 'utf8',
  });
  if (which.status !== 0) {
    return null;
  }
  return (
    which.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

/**
 * @param {string} candidatePath
 * @param {string} rootPath
 * @returns {boolean}
 */
function isPathWithin(candidatePath, rootPath) {
  /**
   * @param {string} value
   * @returns {string}
   */
  const toComparablePath = (value) => {
    const resolved = resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const candidate = toComparablePath(candidatePath);
  const root = toComparablePath(rootPath);
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function getSha256Digest(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

const logger = new PrefixedLogger('[postinstall:knope]');
const { dim, red, green } = createTextHelpers({ useColor: logger.useColor });

if (process.env.GITHUB_ACTIONS && process.env.CI) {
  logger.info(`${dim('Running in CI environment, skipping knope installation')}`);
  process.exit(0);
}

const targetKey = `${process.platform}-${process.arch}`;
const targetConfig = Object.hasOwn(TARGETS, targetKey)
  ? TARGETS[/** @type {SupportedTargetKey} */ (targetKey)]
  : undefined;
if (!targetConfig) {
  const supported = Object.keys(TARGETS).join(', ');
  logger.error(
    `${dim('Unsupported platform: ')}${red(`${process.platform}-${process.arch}`)}${dim('. Supported targets: ')}${supported}`
  );
  process.exit(1);
}
const { target, digest: expectedDigest } = targetConfig;

const bin = join(
  __dirname,
  `../node_modules/.bin/knope${process.platform === 'win32' ? '.exe' : ''}`
);
const localBinDir = join(__dirname, '../node_modules/.bin');
mkdirSync(dirname(bin), { recursive: true });

if (existsSync(bin)) {
  const installed = getKnopeVersion(bin);
  if (installed === VERSION) {
    logger.info(`${dim('knope ')}${green(`v${VERSION}`)}${dim(' already installed')}`);
    process.exit(0);
  }
  logger.info(
    `${dim('Updating knope ')}${red(`v${installed ?? 'unknown'}`)}${dim(' -> ')}${green(`v${VERSION}`)}`
  );
}

const systemKnopePath = getSystemKnopePath();
if (systemKnopePath) {
  const resolvedPath = (() => {
    try {
      return realpathSync(systemKnopePath);
    } catch {
      return systemKnopePath;
    }
  })();

  if (!isPathWithin(resolvedPath, localBinDir)) {
    const installed = getKnopeVersion(systemKnopePath);
    if (installed === VERSION) {
      logger.info(
        `${dim('Using system knope ')}${green(`v${installed}`)}${dim(', skipping download')}`
      );
      process.exit(0);
    }
    if (installed) {
      logger.info(
        `${dim('Found system knope ')}${red(`v${installed}`)}${dim('; installing pinned ')}${green(`v${VERSION}`)}${dim('. Consider updating your system knope.')}`
      );
    }
  }
}

const assetName = `knope-${target}.tgz`;
const url = `https://github.com/knope-dev/knope/releases/download/knope%2Fv${VERSION}/${assetName}`;
logger.info(
  `${dim('Downloading knope ')}${green(`v${VERSION}`)}${dim(' for ')}${target}${dim('...')}`
);
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Failed to download knope: ${response.status} ${response.statusText}`);
}
const gzipBytes = Buffer.from(await response.arrayBuffer());
const actualDigest = getSha256Digest(gzipBytes);
if (actualDigest !== expectedDigest) {
  throw new Error(
    `Downloaded ${assetName} digest mismatch: expected ${expectedDigest}, got ${actualDigest}`
  );
}
const tarBytes = gunzipSync(gzipBytes);
const expectedBinaryName = process.platform === 'win32' ? 'knope.exe' : 'knope';
const knopeBinary = extractRegularFileFromTar(tarBytes, expectedBinaryName);
writeFileSync(bin, knopeBinary);
chmodSync(bin, 0o755);
const installed = getKnopeVersion(bin);
if (installed !== VERSION) {
  throw new Error(
    `Installed knope version mismatch: expected ${VERSION}, got ${installed ?? 'unknown'}`
  );
}
logger.info(`${dim('Installed knope ')}${green(`v${installed}`)}`);
