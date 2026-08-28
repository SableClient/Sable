#!/usr/bin/env node
/* oxlint-disable no-console */

// Updates altstore-source.json with a new version entry pointing at a release
// IPA asset, then prints the updated file. Used by .github/workflows/tauri-build.yml.
//
// Usage: update-altstore-source.mjs <source.json> <version> <build> <ipa-size> <downloadURL> <date> [description]
// Env:   ALTSTORE_MAX_VERSIONS - how many version entries to keep (default 20)

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const [sourcePath, version, build, sizeStr, downloadURL, date, description] = process.argv.slice(2);

if (!sourcePath || !version || !build || !sizeStr || !downloadURL || !date) {
  console.error(
    'Usage: update-altstore-source.mjs <source.json> <version> <build> <ipa-size> <downloadURL> <date> [description]'
  );
  process.exit(1);
}

const size = Number(sizeStr);
if (!Number.isInteger(size) || size <= 0) {
  console.error(`ipa-size must be a positive integer (got: ${sizeStr})`);
  process.exit(1);
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const app = source.apps?.[0];
if (!app) {
  console.error('Source JSON has no apps[0] to update.');
  process.exit(1);
}

// Clean version string for AltStore/SideStore compatibility:
// Apple Info.plist CFBundleShortVersionString / CFBundleVersion replaces hyphens/prereleases (e.g. -nightly.) with numeric/dot delimiters.
const normalizedVersion = version
  .replace(/-nightly\./g, '.')
  .replace(/[^0-9.]/g, '.')
  .replace(/\.+/g, '.')
  .replace(/^\.|\.$/g, '');
const normalizedBuild = build
  .replace(/-nightly\./g, '.')
  .replace(/[^0-9.]/g, '.')
  .replace(/\.+/g, '.')
  .replace(/^\.|\.$/g, '');

const entry = {
  version: normalizedVersion,
  buildVersion: normalizedBuild,
  date,
  size,
  downloadURL,
  localizedDescription: description ?? `v${version}`,
};

// Replace the existing entry for this version, otherwise prepend as latest.
const versions = Array.isArray(app.versions) ? app.versions : [];
const idx = versions.findIndex((v) => v.version === normalizedVersion);
if (idx >= 0) versions[idx] = entry;
else versions.unshift(entry);

// Keep only the most recent versions in the manifest.
const maxVersions = Number(process.env.ALTSTORE_MAX_VERSIONS ?? 20);
if (!Number.isInteger(maxVersions) || maxVersions <= 0) {
  console.error(
    `ALTSTORE_MAX_VERSIONS must be a positive integer (got: ${process.env.ALTSTORE_MAX_VERSIONS})`
  );
  process.exit(1);
}
app.versions = versions.slice(0, maxVersions);

writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
console.log(
  `Updated ${sourcePath}: ${app.bundleIdentifier} v${version} (${build}) -> ${downloadURL}`
);
