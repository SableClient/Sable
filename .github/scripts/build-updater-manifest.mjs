// Composes the Tauri updater manifest (latest.json) from the per-platform .sig
// assets already attached to the release.
// Required env: TAG, VERSION, REPO, GH_TOKEN.

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TAG = process.env.TAG;
const VERSION = process.env.VERSION;
const REPO = process.env.REPO;
if (!TAG || !VERSION || !REPO) {
  console.error('TAG, VERSION, and REPO env vars are required');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(VERSION)) {
  console.error(`VERSION must be valid SemVer (got: ${VERSION})`);
  process.exit(1);
}
const version = VERSION;

const isNightly = process.env.IS_NIGHTLY === 'true';

const dir = mkdtempSync(join(tmpdir(), 'sable-sigs-'));
const signaturePattern = `Sable-${VERSION}-*.sig`;
const signatures = execSync(
  `gh release view "${TAG}" --repo "${REPO}" --json assets --jq '.assets[].name'`,
  { encoding: 'utf8' }
)
  .split('\n')
  .filter((name) => name.startsWith(`Sable-${VERSION}-`) && name.endsWith('.sig'));

if (signatures.length === 0) {
  console.warn('No signed artifacts found for this version; skipping updater manifest.');
  process.exit(0);
}

execSync(
  `gh release download "${TAG}" --repo "${REPO}" --pattern "${signaturePattern}" --dir "${dir}"`,
  {
    stdio: 'inherit',
  }
);

const urlFor = (name) =>
  `https://github.com/${REPO}/releases/download/${TAG}/${encodeURIComponent(name)}`;

const platforms = {};
let windowsIsNsis = false;

for (const sig of readdirSync(dir).filter((f) => f.endsWith('.sig'))) {
  const artifact = sig.replace(/\.sig$/, '');
  const entry = { signature: readFileSync(join(dir, sig), 'utf8').trim(), url: urlFor(artifact) };
  const name = artifact.toLowerCase();

  if (name.endsWith('.app.tar.gz')) {
    platforms['darwin-aarch64'] = entry;
    platforms['darwin-x86_64'] = entry;
  } else if (name.endsWith('.appimage')) {
    platforms[name.includes('-linux-aarch64') ? 'linux-aarch64' : 'linux-x86_64'] = entry;
  } else if (name.endsWith('-setup.exe') || name.endsWith('.nsis.zip')) {
    platforms['windows-x86_64'] = entry;
    windowsIsNsis = true;
  } else if (name.endsWith('.msi') && !windowsIsNsis) {
    platforms['windows-x86_64'] = entry;
  }
}

if (Object.keys(platforms).length === 0) {
  console.warn('No .sig assets found on the release; skipping updater manifest.');
  process.exit(0);
}

let notes = `Sable ${version}`;
if (!isNightly) {
  try {
    notes =
      execSync(`gh release view "${TAG}" --repo "${REPO}" --json body -q .body`, {
        encoding: 'utf8',
      }).trim() || notes;
  } catch {
    // keep the default note
  }
}

const manifest = { version, notes, pub_date: new Date().toISOString(), platforms };
writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
console.warn(JSON.stringify(manifest, null, 2));
