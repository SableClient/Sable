import fs from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

export const DEFAULT_ROOTS = ['src'];
export const SKIP_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'coverage']);
export const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
]);
export const MATRIX_IMPORT_BOUNDARY_FILES = new Set([
  path.normalize('src/types/matrix-sdk.ts'),
  path.normalize('src/types/matrix-sdk-events.d.ts'),
]);

export function toPosix(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function normalizeAliasPattern(pattern) {
  return pattern.replace(/\/\*$/, '');
}

function getConfigErrorMessage(error) {
  return ts.flattenDiagnosticMessageText(error.messageText, '\n');
}

export async function loadAliasMapFromTsconfig(tsconfigPath, projectRoot) {
  const configResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configResult.error) {
    throw new Error(
      `Failed to read ${path.basename(tsconfigPath)}: ${getConfigErrorMessage(configResult.error)}`
    );
  }

  const compilerOptions = configResult.config.compilerOptions ?? {};
  const baseUrl = compilerOptions.baseUrl ?? '.';
  const paths = compilerOptions.paths ?? {};

  const aliasMap = [
    ...new Map(
      Object.entries(paths)
        .map(([aliasPattern, targets]) => {
          if (!Array.isArray(targets) || targets.length === 0) return null;

          const alias = normalizeAliasPattern(aliasPattern);
          const targetPattern = normalizeAliasPattern(targets[0]);
          const absolutePath = path.resolve(projectRoot, baseUrl, targetPattern);

          return [`${alias}:${absolutePath}`, { alias, absolutePath }];
        })
        .filter(Boolean)
    ).values(),
  ];

  aliasMap.sort((a, b) => b.absolutePath.length - a.absolutePath.length);
  return aliasMap;
}

export async function collectSourceFiles(rootDir) {
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
        if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return;
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

export function applyTextReplacements(sourceCode, replacements) {
  return replacements.reduce(
    (code, replacement) =>
      code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end),
    sourceCode
  );
}

export function rewriteSourceImports(filePath, sourceCode, aliases, projectRoot) {
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
    return { changed: false, updatedCode: sourceCode, replacements: 0, edits: [] };
  }

  const uniqueReplacements = [
    ...new Map(
      replacements.map((replacement) => [`${replacement.start}:${replacement.end}`, replacement])
    ).values(),
  ].toSorted((a, b) => b.start - a.start);

  const updatedCode = applyTextReplacements(sourceCode, uniqueReplacements);

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

function stripDeclarationExtension(relativePath) {
  return relativePath
    .replace(/\.d\.[cm]?ts$/i, '')
    .replace(/\.[cm]?tsx?$/i, '')
    .replace(/\.[cm]?js$/i, '');
}

export function getMatrixModuleSpecifierFromDeclarationFile(declarationFile) {
  const normalizedFile = toPosix(declarationFile);
  const marker = '/node_modules/matrix-js-sdk/';
  const markerIndex = normalizedFile.lastIndexOf(marker);

  if (markerIndex === -1) return null;

  const relativePath = normalizedFile.slice(markerIndex + marker.length);
  return `matrix-js-sdk/${stripDeclarationExtension(relativePath)}`;
}

function sortSpecifiers(specifiers) {
  return [...specifiers].toSorted((left, right) =>
    left.importedName.localeCompare(right.importedName)
  );
}

function formatSpecifier({ importedName, localName }) {
  return importedName === localName ? importedName : `${importedName} as ${localName}`;
}

export function renderMatrixImportGroups(groups) {
  const lines = [];

  [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .forEach(([moduleSpecifier, group]) => {
      const valueSpecifiers = sortSpecifiers(group.values);
      const typeSpecifiers = sortSpecifiers(group.types);

      if (valueSpecifiers.length > 0) {
        lines.push(
          `import { ${valueSpecifiers.map(formatSpecifier).join(', ')} } from '${moduleSpecifier}';`
        );
      }

      if (typeSpecifiers.length > 0) {
        lines.push(
          `import type { ${typeSpecifiers.map(formatSpecifier).join(', ')} } from '${moduleSpecifier}';`
        );
      }
    });

  return lines;
}
