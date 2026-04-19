#!/usr/bin/env node
/* oxlint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { createTextHelpers } from './utils/console-style.js';

const DEFAULT_ROOTS = ['src'];
const SKIP_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const MATRIX_IMPORT_BOUNDARY_FILES = new Set([
  path.normalize('src/types/matrix-sdk.ts'),
  path.normalize('src/types/matrix-sdk-events.d.ts'),
]);

function toPosix(inputPath) {
  return inputPath.split(path.sep).join('/');
}

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

async function loadAliasMap(viteConfigPath, projectRoot) {
  const viteConfig = await fs.readFile(viteConfigPath, 'utf8');
  const regex = /(\$[A-Za-z0-9_]+)\s*:\s*path\.resolve\(__dirname,\s*'([^']+)'\s*\)/g;
  const aliasMap = [];
  let match = regex.exec(viteConfig);

  while (match) {
    const alias = match[1];
    const relativePath = match[2];
    aliasMap.push({
      alias,
      absolutePath: path.resolve(projectRoot, relativePath),
    });
    match = regex.exec(viteConfig);
  }

  aliasMap.sort((a, b) => b.absolutePath.length - a.absolutePath.length);
  return aliasMap;
}

async function collectSourceFiles(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith('.') && entry.name !== '.eslintrc') return;
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) return;
          await walk(path.join(currentDir, entry.name));
          return;
        }

        if (!entry.isFile()) return;
        const filePath = path.join(currentDir, entry.name);
        const ext = path.extname(entry.name);
        if (!SOURCE_EXTENSIONS.has(ext)) return;
        files.push(filePath);
      })
    );
  }

  await walk(rootDir);
  return files;
}

function splitSpecifier(specifier) {
  const match = specifier.match(/^([^?#]+)([?#].*)?$/);
  if (!match) {
    return { bare: specifier, suffix: '' };
  }
  return {
    bare: match[1],
    suffix: match[2] ?? '',
  };
}

function findMatchingAlias(absoluteTargetPath, aliases) {
  return aliases.find(({ absolutePath }) => {
    const rel = path.relative(absolutePath, absoluteTargetPath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

function getRewrittenSpecifier(filePath, specifier, aliases, projectRoot) {
  const normalizedFilePath = path.normalize(path.relative(projectRoot, filePath));
  const { bare, suffix } = splitSpecifier(specifier);

  if (
    !MATRIX_IMPORT_BOUNDARY_FILES.has(normalizedFilePath) &&
    (bare === 'matrix-js-sdk' || bare.startsWith('matrix-js-sdk/'))
  ) {
    return `$types/matrix-sdk${suffix}`;
  }

  if (!/^\.\.(?:\/|$)/.test(bare)) {
    return null;
  }

  const absoluteTargetPath = path.resolve(path.dirname(filePath), bare);
  const matchedAlias = findMatchingAlias(absoluteTargetPath, aliases);
  if (!matchedAlias) return null;

  const aliasRelativePath = toPosix(path.relative(matchedAlias.absolutePath, absoluteTargetPath));
  const aliasImport = aliasRelativePath
    ? `${matchedAlias.alias}/${aliasRelativePath}`
    : matchedAlias.alias;
  return `${aliasImport}${suffix}`;
}

function queueReplacement(sourceFile, literalNode, replacements, aliases, filePath, projectRoot) {
  const specifier = literalNode.text;
  const rewrittenSpecifier = getRewrittenSpecifier(filePath, specifier, aliases, projectRoot);
  if (!rewrittenSpecifier || rewrittenSpecifier === specifier) return;

  replacements.push({
    start: literalNode.getStart(sourceFile) + 1,
    end: literalNode.getEnd() - 1,
    original: specifier,
    value: rewrittenSpecifier,
  });
}

function rewriteFileImports(filePath, sourceCode, aliases, projectRoot) {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  const replacements = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      queueReplacement(
        sourceFile,
        node.moduleSpecifier,
        replacements,
        aliases,
        filePath,
        projectRoot
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      queueReplacement(
        sourceFile,
        node.moduleSpecifier,
        replacements,
        aliases,
        filePath,
        projectRoot
      );
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const { literal } = node.argument;
      if (ts.isStringLiteral(literal)) {
        queueReplacement(sourceFile, literal, replacements, aliases, filePath, projectRoot);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const firstArg = node.arguments[0];
      if (ts.isStringLiteral(firstArg)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        if (isDynamicImport || isRequire) {
          queueReplacement(sourceFile, firstArg, replacements, aliases, filePath, projectRoot);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (replacements.length === 0) {
    return { changed: false, updatedCode: sourceCode, replacements: 0 };
  }

  const uniqueReplacements = Array.from(
    new Map(replacements.map((r) => [`${r.start}:${r.end}`, r])).values()
  ).toSorted((a, b) => b.start - a.start);

  const updatedCode = uniqueReplacements.reduce(
    (code, replacement) =>
      code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end),
    sourceCode
  );

  return {
    changed: updatedCode !== sourceCode,
    updatedCode,
    replacements: uniqueReplacements.length,
    edits: uniqueReplacements.map((replacement) => ({
      from: replacement.original,
      to: replacement.value,
    })),
  };
}

async function main() {
  const projectRoot = process.cwd();
  const { write, roots } = parseArgs(process.argv.slice(2));
  const aliases = await loadAliasMap(path.join(projectRoot, 'vite.config.ts'), projectRoot);
  const { dim, red, green } = createTextHelpers();

  if (aliases.length === 0) {
    throw new Error('No aliases found in vite.config.ts');
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
      const { changed, updatedCode, replacements, edits } = rewriteFileImports(
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
