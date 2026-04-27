import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 100,
  tabWidth: 2,
  singleQuote: true,
  trailingComma: 'es5',
  ignorePatterns: [
    'dist',
    'node_modules',
    'package.json',
    'pnpm-lock.yaml',
    'LICENSE',
    'README.md',
    'CHANGELOG.md',
    './changeset',
  ],
});
