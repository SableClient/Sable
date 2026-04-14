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
const recommendedConfig = e18ePlugin.configs?.recommended;
const e18eRecommendedRules =
  recommendedConfig &&
  !Array.isArray(recommendedConfig) &&
  'rules' in recommendedConfig &&
  recommendedConfig.rules
    ? recommendedConfig.rules
    : {};

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
    name: 'e18e/recommended',
    files: ['src/**/*.{js,jsx,ts,tsx}', 'scripts/**/*.js'],
    ignores: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}', 'src/**/*.d.ts'],
    plugins: {
      e18e: e18ePlugin,
    },
    rules: {
      ...e18eRecommendedRules,
      'e18e/prefer-static-regex': 'off',
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
        projectService: false,
        project: ['tsconfig.web.json', 'tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
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
  {
    name: 'project/no-direct-localstorage-in-ui',
    files: ['src/app/components/**/*.{ts,tsx}', 'src/app/features/**/*.{ts,tsx}'],
    ignores: ['src/app/components/**/*.test.{ts,tsx}', 'src/app/features/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'localStorage',
          message:
            'Direct localStorage access is not allowed in components or features. Use an atom (atomWithLocalStorage) or a storage utility from src/app/state/ instead.',
        },
        {
          object: 'window',
          property: 'localStorage',
          message:
            'Direct localStorage access is not allowed in components or features. Use an atom (atomWithLocalStorage) or a storage utility from src/app/state/ instead.',
        },
      ],
    },
  },
  {
    name: 'project/typescript-definition-files',
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },
  {
    name: 'project/secret-storage-helpers',
    files: ['src/client/secretStorageKeys.ts'],
    rules: {
      'no-void': 'off',
    },
  },
  {
    name: 'project/no-js-in-src',
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message: 'JavaScript files are not allowed under src. Use TypeScript instead.',
        },
      ],
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
