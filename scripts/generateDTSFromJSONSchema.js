import { compileFromFile } from 'json-schema-to-typescript';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const schemasDir = join(projectRoot, 'src/types/schemas');

const commandSchemaPath = join(schemasDir, 'command.schema.json');
const commandDtsPath = join(schemasDir, 'command.d.ts');
const commandListSchemaPath = join(schemasDir, 'commandList.schema.json');
const commandListDtsPath = join(schemasDir, 'commandList.d.ts');

const compileOptions = {
  cwd: schemasDir,
};

compileFromFile(commandSchemaPath, compileOptions).then((ts) =>
  fs.writeFileSync(commandDtsPath, ts)
);

compileFromFile(commandListSchemaPath, compileOptions).then((ts) =>
  fs.writeFileSync(commandListDtsPath, ts)
);
