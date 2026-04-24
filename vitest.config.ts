import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

// Standalone Vitest config — intentionally excludes Cloudflare, PWA, compression,
// and other production-only Vite plugins that don't apply to unit tests.
export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    APP_VERSION: JSON.stringify('test'),
    BUILD_HASH: JSON.stringify(''),
    IS_RELEASE_TAG: JSON.stringify(false),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.tsx',
        'src/sw.ts',
        'src/sw-session.ts',
        'src/instrument.ts',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
      ],
      // Baseline locked at current coverage. Raise these thresholds as test
      // coverage improves, never lower them.
      thresholds: {
        statements: 1.5,
        branches: 1,
        functions: 1.5,
        lines: 1.5,
      },
    },
  },
});
