import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
  },
  plugins: ['react', 'jsx-a11y', 'typescript', 'import', 'unicorn', 'oxc', 'vitest', 'promise'],
  jsPlugins: ['@e18e/eslint-plugin'],
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
    'e18e/ban-dependencies': 'error',
    'e18e/prefer-array-at': 'error',
    'e18e/prefer-array-fill': 'error',
    'e18e/prefer-array-from-map': 'error',
    'e18e/prefer-array-some': 'error',
    'e18e/prefer-array-to-reversed': 'error',
    'e18e/prefer-array-to-sorted': 'error',
    'e18e/prefer-array-to-spliced': 'error',
    'e18e/prefer-date-now': 'error',
    'e18e/prefer-includes': 'error',
    'e18e/prefer-nullish-coalescing': 'error',
    'e18e/prefer-object-has-own': 'error',
    'e18e/prefer-regex-test': 'error',
    'e18e/prefer-spread-syntax': 'error',
    'e18e/prefer-static-regex': 'off',
    'e18e/prefer-timer-args': 'error',
    'e18e/prefer-url-canparse': 'error',
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
