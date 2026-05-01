import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
  },
  plugins: ['react', 'jsx-a11y', 'typescript', 'import', 'unicorn', 'oxc', 'vitest', 'promise'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
    style: 'off',
  },
  env: {
    browser: true,
    builtin: true,
  },
  rules: {
    'import/no-unassigned-import': 'off',
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': ['error', { extensions: ['.tsx', '.jsx'] }],
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    'react/iframe-missing-sandbox': 'off',
    'jsx-a11y/no-autofocus': 'off',
    'jsx-a11y/prefer-tag-over-role': 'off',
    'typescript/no-explicit-any': 'error',
    'typescript/consistent-type-imports': 'error',
    'typescript/only-throw-error': 'error',
    'typescript/no-unsafe-type-assertion': 'off',
    'typescript/no-floating-promises': 'off',
    'typescript/no-unnecessary-type-arguments': 'off',
    'oxc/no-map-spread': 'off',
    'promise/always-return': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
      rules: {
        'typescript/no-unused-vars': [
          'error',
          {
            args: 'after-used',
            ignoreRestSiblings: true,
            vars: 'all',
          },
        ],
        'typescript/no-shadow': 'error',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'typescript/unbound-method': 'off',
        'typescript/no-unsafe-enum-comparison': 'off',
      },
    },
  ],
});
