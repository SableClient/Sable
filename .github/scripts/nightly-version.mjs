#!/usr/bin/env node
/* oxlint-disable no-console */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);

if (!match) {
  console.error(`package.json version must be stable SemVer (got: ${packageJson.version})`);
  process.exit(1);
}

let timestamp;
try {
  // Read the HEAD commit's committer timestamp in UTC epoch seconds
  const commitTimestamp = execSync('git log -1 --format=%ct', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (/^\d+$/.test(commitTimestamp)) {
    timestamp = new Date(Number(commitTimestamp) * 1000);
  }
} catch {
  // Fallback to current system time if git is unavailable
}

timestamp ||= new Date();

const year = String(timestamp.getUTCFullYear()).slice(-2);
const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
const day = String(timestamp.getUTCDate()).padStart(2, '0');
const hours = String(timestamp.getUTCHours()).padStart(2, '0');
const minutes = String(timestamp.getUTCMinutes()).padStart(2, '0');

const timeIdentifier = `${year}${month}${day}${hours}${minutes}`;

const [, major, minor, patch] = match;
console.log(`${major}.${minor}.${Number(patch) + 1}-nightly.${timeIdentifier}`);
