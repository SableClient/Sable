import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The engine boundary is stringly typed, so a rename on either side fails only at runtime.
const RUST_DIR = 'src-tauri/src/matrix_crypto';
const TS_DIRS = ['src/app/crypto', 'src/app/crypto/olmMachine'];

const readAll = (dir: string, extension: string): string =>
  readdirSync(dir)
    .filter((name) => name.endsWith(extension) && !name.includes('.test.'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');

const matchAll = (source: string, pattern: RegExp): Set<string> =>
  new Set([...source.matchAll(pattern)].map((match) => match[1]!));

describe('engine IPC contract', () => {
  const rust = readAll(RUST_DIR, '.rs');
  const ts = TS_DIRS.map((dir) => readAll(dir, '.ts')).join('\n');

  const arms = matchAll(rust, /^\s+"([a-zA-Z.]+)" =>/gm);
  const called = matchAll(ts, /(?:#call|ctx\.call|\bcall)\(\s*'([a-zA-Z.]+)'/g);

  it('parses both sides', () => {
    expect(arms.size).toBeGreaterThan(40);
    expect(called.size).toBeGreaterThan(40);
  });

  it('every method the TS proxy calls is handled by the Rust dispatch', () => {
    const handled = (method: string) => arms.has(method) || arms.has(`dehydratedDevices.${method}`);

    expect([...called].filter((method) => !handled(method)).toSorted()).toEqual([]);
  });

  it('returns encrypted room content using the wasm JSON-string contract', () => {
    expect(rust).toMatch(
      /"encryptRoomEvent" =>[\s\S]*Ok\(Value::String\(encrypted_json\.to_owned\(\)\)\)/
    );
  });
});
