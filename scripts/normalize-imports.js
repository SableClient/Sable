#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createTextHelpers } from './utils/console-style.js';
import {
  DEFAULT_ROOTS,
  collectSourceFiles,
  loadAliasMapFromTsconfig,
  rewriteSourceImports,
  toPosix,
} from './utils/import-rewrites.js';

function parseArgs(argv) {
  let write = false;
  const roots = [];
  let index = 0;

  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--write') {
      write = true;
    } else if (arg === '--root' && argv[index + 1]) {
      roots.push(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--root=')) {
      roots.push(arg.slice('--root='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: node scripts/normalize-imports.mjs [--write] [--root <dir>]',
          '',
          'Default mode is dry-run.',
          '--write      Apply changes to files.',
          '--root       Root directory to scan (repeatable). Default: src',
        ].join('\n')
      );
      process.exit(0);
    }

    index += 1;
  }

  return {
    write,
    roots: roots.length > 0 ? roots : DEFAULT_ROOTS,
  };
}

async function main() {
  const projectRoot = process.cwd();
  const { write, roots } = parseArgs(process.argv.slice(2));
  const aliases = await loadAliasMapFromTsconfig(
    path.join(projectRoot, 'tsconfig.json'),
    projectRoot
  );
  const { dim, red, green } = createTextHelpers();

  if (aliases.length === 0) {
    throw new Error('No aliases found in tsconfig.json');
  }

  const targetRoots = roots.map((root) => path.resolve(projectRoot, root));
  const sourceFiles = (
    await Promise.all(
      targetRoots.map(async (root) => {
        try {
          const stat = await fs.stat(root);
          if (!stat.isDirectory()) return [];
          return collectSourceFiles(root);
        } catch {
          return [];
        }
      })
    )
  ).flat();

  const fileResults = await Promise.all(
    sourceFiles.map(async (filePath) => {
      const sourceCode = await fs.readFile(filePath, 'utf8');
      const { changed, updatedCode, replacements, edits } = rewriteSourceImports(
        filePath,
        sourceCode,
        aliases,
        projectRoot
      );

      if (!changed) return null;

      if (write) {
        await fs.writeFile(filePath, updatedCode, 'utf8');
      }

      return {
        file: toPosix(path.relative(projectRoot, filePath)),
        replacements,
        edits,
      };
    })
  );

  const changedFiles = fileResults.filter((result) => result !== null);
  const filesChanged = changedFiles.length;
  const importRewrites = changedFiles.reduce((total, result) => total + result.replacements, 0);
  const displayRows = changedFiles.flatMap((result) =>
    result.edits.map((edit) => ({
      file: result.file,
      from: edit.from,
      to: edit.to,
    }))
  );

  displayRows.sort((a, b) =>
    a.file === b.file ? a.from.localeCompare(b.from) : a.file.localeCompare(b.file)
  );
  displayRows.forEach((row) => {
    const fileLabel = dim(row.file);
    const fromLabel = red(`"${row.from}"`);
    const arrowLabel = dim(' -> ');
    const toLabel = green(`"${row.to}"`);
    console.log(`${fileLabel}: ${fromLabel}${arrowLabel}${toLabel}`);
  });

  const mode = write ? 'Applied' : 'Dry run';
  console.log(`${mode}: ${importRewrites} imports across ${filesChanged} files.`);
  if (!write) {
    console.log('Re-run with --write to apply changes.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
