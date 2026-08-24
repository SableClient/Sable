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
      'matrix-js-sdk/lib': path.resolve(__dirname, 'node_modules/matrix-js-sdk/lib'),
      'matrix-js-sdk': path.resolve(__dirname, 'node_modules/matrix-js-sdk/lib/matrix.js'),
      $hooks: path.resolve(__dirname, 'src/app/hooks'),
      $plugins: path.resolve(__dirname, 'src/app/plugins'),
      $components: path.resolve(__dirname, 'src/app/components'),
      $features: path.resolve(__dirname, 'src/app/features'),
      $generated: path.resolve(__dirname, 'src/app/generated'),
      $state: path.resolve(__dirname, 'src/app/state'),
      $styles: path.resolve(__dirname, 'src/app/styles'),
      $utils: path.resolve(__dirname, 'src/app/utils'),
      $pages: path.resolve(__dirname, 'src/app/pages'),
      $types: path.resolve(__dirname, 'src/types'),
      $public: path.resolve(__dirname, 'public'),
      $client: path.resolve(__dirname, 'src/client'),
      $unstable: path.resolve(__dirname, 'src/unstable'),
      $app: path.resolve(__dirname, 'src/app'),
      '@sableclient/tauri-plugin-notifications-api': path.resolve(
        __dirname,
        'src/test/notifications-api-stub.ts'
      ),
    },
  },
  define: {
    SABLE_PRODUCT_NAME: JSON.stringify('Sable'),
    SABLE_BUILD_FLAVOR: JSON.stringify('stable'),
    APP_VERSION: JSON.stringify('test'),
    BUILD_HASH: JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    server: {
      deps: {
        // The package is ESM that imports matrix-js-sdk deep paths, so Vite has
        // to process it for the SDK alias above to apply.
        inline: [/matrix-js-sdk\/lib\//, /@sableclient\/matrixrtc/],
      },
    },
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
