import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'path';

// Standalone Vitest config — intentionally excludes Cloudflare, PWA, compression,
// and other production-only Vite plugins that don't apply to unit tests.
export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  resolve: {
    alias: {
      $hooks: path.resolve(__dirname, 'src/app/hooks'),
      $plugins: path.resolve(__dirname, 'src/app/plugins'),
      $components: path.resolve(__dirname, 'src/app/components'),
      $features: path.resolve(__dirname, 'src/app/features'),
      $state: path.resolve(__dirname, 'src/app/state'),
      $styles: path.resolve(__dirname, 'src/app/styles'),
      $utils: path.resolve(__dirname, 'src/app/utils'),
      $pages: path.resolve(__dirname, 'src/app/pages'),
      $types: path.resolve(__dirname, 'src/types'),
      $public: path.resolve(__dirname, 'public'),
      $client: path.resolve(__dirname, 'src/client'),
    },
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
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
    },
  },
});
