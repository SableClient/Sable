import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getMatrixModuleSpecifierFromDeclarationFile,
  loadAliasMapFromTsconfig,
  rewriteSourceImports,
} from './utils/import-rewrites.js';

const tempDirs = [];

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sable-import-rewrites-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('loadAliasMapFromTsconfig + rewriteSourceImports', () => {
  it('rewrites relative imports using tsconfig path aliases', async () => {
    const projectRoot = await makeTempProject();
    await fs.writeFile(
      path.join(projectRoot, 'tsconfig.web.json'),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '$components/*': ['src/app/components/*'],
              '$types/*': ['src/types/*'],
            },
          },
        },
        null,
        2
      )
    );

    const aliases = await loadAliasMapFromTsconfig(
      path.join(projectRoot, 'tsconfig.web.json'),
      projectRoot
    );

    const filePath = path.join(projectRoot, 'src/app/pages/Home.tsx');
    const sourceCode = [
      "import { Header } from '../components/Header';",
      "import { MatrixClient } from 'matrix-js-sdk/lib/client';",
      '',
    ].join('\n');

    const result = rewriteSourceImports(filePath, sourceCode, aliases, projectRoot);

    expect(result.changed).toBe(true);
    expect(result.updatedCode).toContain("from '$components/Header'");
    expect(result.updatedCode).toContain("from '$types/matrix-sdk'");
  });
});

describe('getMatrixModuleSpecifierFromDeclarationFile', () => {
  it('normalizes matrix-js-sdk declaration paths to bare module specifiers', () => {
    const declarationFile = String.raw`C:\repo\node_modules\matrix-js-sdk\lib\models\room.d.ts`;

    expect(getMatrixModuleSpecifierFromDeclarationFile(declarationFile)).toBe(
      'matrix-js-sdk/lib/models/room'
    );
  });
});
