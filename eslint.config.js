import path from 'node:path';

import e18ePlugin from '@e18e/eslint-plugin';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { configs, helpers, plugins } from 'eslint-config-airbnb-extended';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { rules as prettierConfigRules } from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

const gitignorePath = path.resolve('.', '.gitignore');
const { jsFiles, tsFiles } = helpers.extensions;

const jsConfig = defineConfig([
  // ESLint recommended config
  {
    name: 'js/config',
    ...js.configs.recommended,
  },
  // Stylistic plugin
  plugins.stylistic,
  // Import X plugin
  plugins.importX,
  // Airbnb base recommended config
  ...configs.base.recommended,
]);

const reactConfig = defineConfig([
  // React plugin
  plugins.react,
  // React hooks plugin
  plugins.reactHooks,
  // React JSX A11y plugin
  plugins.reactA11y,
  // Airbnb React recommended config
  ...configs.react.recommended,
  // React 17+ automatic JSX runtime
  reactPlugin.configs.flat['jsx-runtime'],
]);

const typescriptConfig = defineConfig([
  // TypeScript ESLint plugin
  plugins.typescriptEslint,
  // Airbnb base TypeScript config
  ...configs.base.typescript,
  // Airbnb React TypeScript config
  ...configs.react.typescript,
]);

const prettierConfig = defineConfig([
  // Prettier plugin
  {
    name: 'prettier/plugin/config',
    plugins: {
      prettier: prettierPlugin,
    },
  },
  // Prettier config
  {
    name: 'prettier/config',
    rules: {
      ...prettierConfigRules,
      'prettier/prettier': 'error',
    },
  },
]);

const e18eConfig = defineConfig([
  {
    name: 'e18e/scripts',
    files: ['scripts/**/*.js'],
    plugins: {
      e18e: e18ePlugin,
    },
    rules: {
      'e18e/prefer-array-at': 'error',
      'e18e/prefer-array-some': 'error',
      'e18e/prefer-array-to-sorted': 'error',
      'e18e/prefer-spread-syntax': 'error',
    },
  },
]);

const scriptOverrides = defineConfig([
  {
    name: 'project/script-overrides',
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-await-in-loop': 'off',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-restricted-syntax': 'off',
      'prefer-destructuring': 'off',
    },
  },
]);

const projectOverrides = defineConfig([
  {
    name: 'project/rule-overrides',
    files: [...jsFiles, ...tsFiles],
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: ['tsconfig.web.json', 'tsconfig.node.json'],
        }),
      ],
    },
    languageOptions: {
      globals: {
        JSX: 'readonly',
        ...globals.browser,
      },
    },
    rules: {
      'linebreak-style': 'off',
      'no-underscore-dangle': 'off',
      'no-shadow': 'off',
      'import-x/prefer-default-export': 'off',
      'import-x/extensions': 'off',
      'import-x/no-unresolved': 'off',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: true,
          bundledDependencies: true,
        },
      ],
      'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
      'react/jsx-filename-extension': [
        'error',
        {
          extensions: ['.tsx', '.jsx'],
        },
      ],
      // obsolete in a React 19
      'react/prop-types': 'off',
      'react/require-default-props': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    name: 'project/typescript-rule-overrides',
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // disabled for now to get eslint to pass
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          enableAutofixRemoval: {
            imports: true,
          },
          ignoreRestSiblings: true,
          vars: 'all',
        },
      ],
      '@typescript-eslint/no-shadow': 'error',
      'no-undef': 'off',
    },
  },
]);

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  ...jsConfig,
  ...reactConfig,
  ...typescriptConfig,
  ...e18eConfig,
  ...scriptOverrides,
  ...prettierConfig,
  ...projectOverrides,
]);
