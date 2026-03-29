#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

import { createTextHelpers } from './utils/console-style.js';
import {
  DEFAULT_ROOTS,
  applyTextReplacements,
  collectSourceFiles,
  getMatrixModuleSpecifierFromDeclarationFile,
  renderMatrixImportGroups,
  toPosix,
} from './utils/import-rewrites.js';

const MATRIX_BOUNDARY_SPECIFIER = '$types/matrix-sdk';

/**
 * @typedef {{
 *   write: boolean;
 *   roots: string[];
 * }} CliArgs
 */

/**
 * @typedef {{
 *   importedName: string;
 *   localName: string;
 * }} ImportEntry
 */

/**
 * @typedef {{
 *   values: ImportEntry[];
 *   types: ImportEntry[];
 * }} MatrixImportGroup
 */

/**
 * @typedef {{
 *   start: number;
 *   end: number;
 *   original: string;
 *   value: string;
 * }} Replacement
 */

/**
 * @param {string[]} argv
 * @returns {CliArgs}
 */
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
          'Usage: node scripts/migrate-matrix-sdk-imports.js [--write] [--root <dir>]',
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

/**
 * @param {string} projectRoot
 * @returns {import('typescript').Program}
 */
function loadProgram(projectRoot) {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  const configResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (configResult.error) {
    const message = ts.flattenDiagnosticMessageText(configResult.error.messageText, '\n');
    throw new Error(`Failed to read tsconfig.json: ${message}`);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    projectRoot,
    undefined,
    tsconfigPath
  );

  if (parsedConfig.errors.length > 0) {
    const message = parsedConfig.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
      .join('\n');
    throw new Error(`Failed to parse tsconfig.json:\n${message}`);
  }

  return ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
}

/**
 * @param {string} filePath
 * @param {string[]} rootPaths
 * @returns {boolean}
 */
function isWithinRoots(filePath, rootPaths) {
  return rootPaths.some((rootPath) => {
    const relativePath = path.relative(rootPath, filePath);
    return (
      relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    );
  });
}

/**
 * @param {import('typescript').TypeChecker} checker
 * @param {import('typescript').ImportSpecifier} specifier
 * @returns {string | null}
 */
function getDeclarationModuleSpecifier(checker, specifier) {
  const importedSymbol = checker.getSymbolAtLocation(specifier.name);
  if (!importedSymbol) return null;

  const resolvedSymbol =
    importedSymbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(importedSymbol)
      : importedSymbol;
  const declaration = resolvedSymbol.declarations?.[0];
  if (!declaration) return null;

  return getMatrixModuleSpecifierFromDeclarationFile(declaration.getSourceFile().fileName);
}

/**
 * @param {import('typescript').ImportSpecifier} specifier
 * @returns {ImportEntry}
 */
function getImportEntry(specifier) {
  return {
    importedName: specifier.propertyName?.text ?? specifier.name.text,
    localName: specifier.name.text,
  };
}

/**
 * @param {import('typescript').TypeChecker} checker
 * @param {import('typescript').ImportDeclaration} importDeclaration
 * @returns {string | null}
 */
function buildReplacementText(checker, importDeclaration) {
  const importClause = importDeclaration.importClause;
  if (
    !importClause ||
    !importClause.namedBindings ||
    !ts.isNamedImports(importClause.namedBindings)
  ) {
    return null;
  }

  /** @type {Map<string, MatrixImportGroup>} */
  const groups = new Map();

  for (const specifier of importClause.namedBindings.elements) {
    const moduleSpecifier = getDeclarationModuleSpecifier(checker, specifier);
    if (!moduleSpecifier) {
      return null;
    }

    const group = groups.get(moduleSpecifier) ?? { values: [], types: [] };
    const bucket = importClause.isTypeOnly || specifier.isTypeOnly ? group.types : group.values;
    bucket.push(getImportEntry(specifier));
    groups.set(moduleSpecifier, group);
  }

  return renderMatrixImportGroups(groups).join('\n');
}

/**
 * @param {import('typescript').SourceFile} sourceFile
 * @param {import('typescript').TypeChecker} checker
 * @returns {Replacement[]}
 */
function collectReplacements(sourceFile, checker) {
  /** @type {Replacement[]} */
  const replacements = [];

  /**
   * @param {import('typescript').Node} node
   */
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === MATRIX_BOUNDARY_SPECIFIER
    ) {
      const replacementText = buildReplacementText(checker, node);
      if (replacementText) {
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          original: '',
          value: replacementText,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return replacements.sort((left, right) => right.start - left.start);
}

async function main() {
  const projectRoot = process.cwd();
  const { write, roots } = parseArgs(process.argv.slice(2));
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

  const sourceFileSet = new Set(sourceFiles.map((filePath) => path.normalize(filePath)));
  const program = loadProgram(projectRoot);
  const checker = program.getTypeChecker();
  const { dim, green } = createTextHelpers();

  const changes = [];

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = path.normalize(sourceFile.fileName);
    if (!sourceFileSet.has(filePath) || !isWithinRoots(filePath, targetRoots)) continue;

    const replacements = collectReplacements(sourceFile, checker);
    if (replacements.length === 0) continue;

    const originalCode = sourceFile.getFullText();
    const updatedCode = applyTextReplacements(originalCode, replacements);

    if (write) {
      await fs.writeFile(filePath, updatedCode, 'utf8');
    }

    changes.push({
      file: toPosix(path.relative(projectRoot, filePath)),
      replacements: replacements.length,
    });
  }

  changes
    .sort((left, right) => left.file.localeCompare(right.file))
    .forEach((change) => {
      console.log(
        `${dim(change.file)}: ${green(`${change.replacements} matrix import rewrite(s)`)}`
      );
    });

  const mode = write ? 'Applied' : 'Dry run';
  console.log(`${mode}: ${changes.length} files.`);
  if (!write) {
    console.log('Re-run with --write to apply changes.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
