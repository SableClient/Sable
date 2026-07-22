#!/usr/bin/env node
//MISE description="Replace icon assets from SVG inputs"
//MISE tools={ffmpeg="7.1.1"}

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { PrefixedLogger, createTextHelpers } from '../utils/console-style.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = resolve(__dirname, '..');

function resolveBinary(name) {
  try {
    const root = execFileSync('mise', ['where', name], { encoding: 'utf-8' }).trim();
    const candidates = [
      join(root, 'Library', 'bin', `${name}.exe`),
      join(root, 'bin', `${name}.exe`),
      join(root, `${name}.exe`),
    ];
    for (const exe of candidates) {
      if (existsSync(exe)) return exe;
    }
  } catch {
    /* fallback to path */
  }
  return name;
}

const FFMPEG = resolveBinary('ffmpeg');

const logger = new PrefixedLogger('[replace-logo]');
const { red } = createTextHelpers({ useColor: logger.useColor });

/**
 * Display a question on stdin and return the user's trimmed response.
 * @param {string} question - The prompt text to display.
 * @returns {Promise<string>} The user's input with surrounding whitespace removed.
 */
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve_) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve_(answer.trim());
    });
  });
}

/** Print CLI usage instructions to stdout. */
function usage() {
  logger.info(`Usage: run this script and provide four file paths when prompted.
It will replace icons in the repository public/ tree using ffmpeg.

You will be prompted for:
 - maskless (borderless) logo (used for maskable icons)
 - circular logo (used for circular icons)
 - highlight variant (icon for highlight indicator)
 - unread variant (icon for unread indicator)

Requires: ffmpeg, base64`);
}

/**
 * Render an SVG to a PNG at the given square dimension using ffmpeg.
 * Creates the output directory if it doesn't already exist.
 * @param {string} input - Absolute path to the source SVG file.
 * @param {string} output - Absolute path for the generated PNG.
 * @param {string | number} size - Width and height in pixels.
 */
function ffmpegCmd(input, output, size) {
  mkdirSync(dirname(output), { recursive: true });
  logger.info(`Generating ${output} (${size} x ${size})`);
  execFileSync(
    FFMPEG,
    ['-y', '-width', String(size), '-height', String(size), '-i', input, output],
    {
      stdio: 'pipe',
    }
  );
}

/**
 * Check whether a file path has an SVG extension (case-insensitive).
 * @param {string} filePath
 * @returns {boolean}
 */
function isSvg(filePath) {
  return filePath.toLowerCase().endsWith('.svg');
}

/**
 * Entry point. Prompts for four SVG logo variants, validates them,
 * then renders PNGs at every required size and copies SVGs into public/res/svg/.
 * @param {string[]} args - CLI arguments (supports --help / -h).
 */
async function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  const maskless = await prompt('Path to maskless (borderless) logo: ');
  const circular = await prompt('Path to circular logo: ');
  const highlight = await prompt('Path to highlight variant: ');
  const unread = await prompt('Path to unread variant: ');

  for (const f of [maskless, circular, highlight, unread]) {
    if (!existsSync(f)) {
      logger.error(`${red('File not found:')} ${f}`);
      process.exit(2);
    }
    if (!isSvg(f)) {
      logger.error(`${red('Input must be an SVG:')} ${f}`);
      process.exit(3);
    }
  }

  /** @type {[number, string][]} */
  const CIRCULAR_TARGETS = [
    [512, 'public/favicon.png'],
    [2560, 'public/full_res_sable.png'],
    [144, 'public/res/logo/logo-144x144.png'],
    [192, 'public/res/logo/logo-192x192.png'],
    [256, 'public/res/logo/logo-256x256.png'],
    [36, 'public/res/logo/logo-36x36.png'],
    [384, 'public/res/logo/logo-384x384.png'],
    [48, 'public/res/logo/logo-48x48.png'],
    [512, 'public/res/logo/logo-512x512.png'],
    [72, 'public/res/logo/logo-72x72.png'],
    [96, 'public/res/logo/logo-96x96.png'],
  ];

  logger.info('Replacing circular icons...');
  for (const [size, out] of CIRCULAR_TARGETS) {
    ffmpegCmd(circular, resolve(BASE_DIR, out), size);
  }

  /** @type {[number, string][]} */
  const MASKABLE_TARGETS = [
    [114, 'public/res/logo-maskable/logo-maskable-114x114.png'],
    [120, 'public/res/logo-maskable/logo-maskable-120x120.png'],
    [144, 'public/res/logo-maskable/logo-maskable-144x144.png'],
    [152, 'public/res/logo-maskable/logo-maskable-152x152.png'],
    [167, 'public/res/logo-maskable/logo-maskable-167x167.png'],
    [180, 'public/res/logo-maskable/logo-maskable-180x180.png'],
    [192, 'public/res/logo-maskable/logo-maskable-192x192.png'],
    [256, 'public/res/logo-maskable/logo-maskable-256x256.png'],
    [36, 'public/res/logo-maskable/logo-maskable-36x36.png'],
    [384, 'public/res/logo-maskable/logo-maskable-384x384.png'],
    [48, 'public/res/logo-maskable/logo-maskable-48x48.png'],
    [512, 'public/res/logo-maskable/logo-maskable-512x512.png'],
    [57, 'public/res/logo-maskable/logo-maskable-57x57.png'],
    [60, 'public/res/logo-maskable/logo-maskable-60x60.png'],
    [72, 'public/res/logo-maskable/logo-maskable-72x72.png'],
    [76, 'public/res/logo-maskable/logo-maskable-76x76.png'],
    [96, 'public/res/logo-maskable/logo-maskable-96x96.png'],
  ];

  logger.info('Replacing maskable icons (using maskless input)...');
  for (const [size, out] of MASKABLE_TARGETS) {
    ffmpegCmd(maskless, resolve(BASE_DIR, out), size);
  }

  logger.info('Handling SVG assets in public/res/svg/...');
  const svgDir = resolve(BASE_DIR, 'public/res/svg');
  mkdirSync(svgDir, { recursive: true });

  logger.info(`Copying circular SVG to ${svgDir}/logo.svg`);
  copyFileSync(circular, resolve(svgDir, 'logo.svg'));

  logger.info(`Copying maskable SVG to ${svgDir}/logo-maskable.svg`);
  copyFileSync(maskless, resolve(svgDir, 'logo-maskable.svg'));

  copyFileSync(highlight, resolve(svgDir, 'highlight.svg'));
  copyFileSync(unread, resolve(svgDir, 'unread.svg'));

  logger.info('All done. Please review the generated files.');
}

main(process.argv.slice(2));
