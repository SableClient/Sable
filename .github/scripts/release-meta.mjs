#!/usr/bin/env node
/* oxlint-disable no-console */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function computeNightlyVersion(baseVersion, timestamp = new Date()) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(baseVersion);
  if (!match) {
    throw new Error(`Version must be stable SemVer (got: ${baseVersion})`);
  }

  const y = String(timestamp.getUTCFullYear()).slice(-2);
  const m = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
  const d = String(timestamp.getUTCDate()).padStart(2, '0');
  const h = String(timestamp.getUTCHours()).padStart(2, '0');
  const min = String(timestamp.getUTCMinutes()).padStart(2, '0');
  const sec = String(timestamp.getUTCSeconds()).padStart(2, '0');

  const [, major, minor, patch] = match;
  // Second resolution so same-minute commits get distinct build versions.
  return `${major}.${minor}.${Number(patch) + 1}-nightly.${y}${m}${d}${h}${min}${sec}`;
}

export function nightlyVersion() {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

  let timestamp;
  try {
    const commitTimestamp = execSync('git log -1 --format=%ct', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d+$/.test(commitTimestamp)) {
      timestamp = new Date(Number(commitTimestamp) * 1000);
    }
  } catch {}

  let sha = 'local';
  try {
    sha = execSync('git rev-parse --short=12 HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}

  return `${computeNightlyVersion(version, timestamp)}.${sha}`;
}

export async function writeOutputs(outputPath, entries) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(outputPath, entries.map((e) => `${e.key}=${e.value}`).join('\n') + '\n');
}

export function resolveReleaseMeta({
  eventName = '',
  inputTag = '',
  gitRef = '',
  gitRefName = '',
  gitSha = '',
} = {}) {
  const startedAt = new Date().toISOString();
  let tag, ref, isNightly, version;

  if (eventName === 'workflow_dispatch' && inputTag) {
    tag = inputTag;
    ref = inputTag;
    isNightly = false;
    version = tag.replace(/^v/, '');
  } else if (gitRef === 'refs/heads/dev') {
    tag = 'nightly';
    ref = gitSha;
    isNightly = true;
    version = nightlyVersion();
  } else if (/^v\d+\./.test(gitRefName)) {
    tag = gitRefName;
    ref = gitRef;
    isNightly = false;
    version = gitRefName.replace(/^v/, '');
  } else {
    tag = '';
    ref = gitRef;
    isNightly = false;
    version = '';
  }

  return {
    tag,
    version,
    ref,
    isNightly,
    startedAt,
    buildFlavor: isNightly ? 'dev' : 'stable',
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const meta = resolveReleaseMeta({
      eventName: process.env.EVENT_NAME ?? '',
      inputTag: process.env.INPUT_TAG ?? '',
      gitRef: process.env.GIT_REF ?? '',
      gitRefName: process.env.GIT_REF_NAME ?? '',
      gitSha: process.env.GIT_SHA ?? '',
    });

    const outputPath = process.argv[2];
    const entries = [
      { key: 'tag', value: meta.tag },
      { key: 'version', value: meta.version },
      { key: 'ref', value: meta.ref },
      { key: 'nightly', value: String(meta.isNightly) },
      { key: 'started_at', value: meta.startedAt },
      { key: 'build_flavor', value: meta.buildFlavor },
    ];

    if (outputPath) {
      await writeOutputs(outputPath, entries);
    } else {
      entries.forEach(({ key, value }) => console.log(`${key}=${value}`));
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
