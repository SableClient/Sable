#!/usr/bin/env node
/* oxlint-disable no-console */

// Usage: render-flatpak-nightly.mjs <version> <x86_64-sha256:size> <aarch64-sha256:size> [date]
// Pass "-" for an architecture that is not being published.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const [version, x86, arm, dateArg] = process.argv.slice(2);

if (!version || !x86 || !arm) {
  console.error(
    'Usage: render-flatpak-nightly.mjs <version> <x86_64-sha256:size> <aarch64-sha256:size> [date]'
  );
  process.exit(1);
}

const parseArch = (arch, value) => {
  if (value === '-') return null;
  const [sha, sizeStr] = value.split(':');
  if (!/^[0-9a-f]{64}$/.test(sha ?? '')) {
    console.error(`${arch}: expected a 64-character sha256 (got: ${sha})`);
    process.exit(1);
  }
  const size = Number(sizeStr);
  if (!Number.isInteger(size) || size <= 0) {
    console.error(`${arch}: expected a positive integer size (got: ${sizeStr})`);
    process.exit(1);
  }
  return { sha, size };
};

const arches = {
  x86_64: parseArch('x86_64', x86),
  aarch64: parseArch('aarch64', arm),
};

if (!arches.x86_64 && !arches.aarch64) {
  console.error('At least one architecture must be published.');
  process.exit(1);
}

const date = dateArg || new Date().toISOString().slice(0, 10);
const dir = 'packaging/flatpak/nightly';

let manifest = readFileSync(`${dir}/moe.sable.client.Nightly.yml.in`, 'utf8').replaceAll(
  '@VERSION@',
  version
);

for (const [arch, values] of Object.entries(arches)) {
  const suffix = arch.toUpperCase();
  if (values) {
    manifest = manifest
      .replaceAll(`@SHA256_${suffix}@`, values.sha)
      .replaceAll(`@SIZE_${suffix}@`, String(values.size));
    continue;
  }
  const block = new RegExp(
    `      - type: extra-data\\n(?:        .*\\n)*?        only-arches: \\[${arch}\\]\\n`
  );
  if (!block.test(manifest)) {
    console.error(`Could not find the ${arch} extra-data source to drop.`);
    process.exit(1);
  }
  manifest = manifest.replace(block, '');
}

const leftover = manifest.match(/@[A-Z0-9_]+@/);
if (leftover) {
  console.error(`Unsubstituted placeholder left in the manifest: ${leftover[0]}`);
  process.exit(1);
}

writeFileSync(`${dir}/moe.sable.client.Nightly.yml`, manifest);
writeFileSync(
  `${dir}/moe.sable.client.Nightly.metainfo.xml`,
  readFileSync(`${dir}/moe.sable.client.Nightly.metainfo.xml.in`, 'utf8')
    .replaceAll('@VERSION@', version)
    .replaceAll('@DATE@', date)
);

console.log(`Rendered the nightly Flatpak manifest for ${version} (${date})`);
