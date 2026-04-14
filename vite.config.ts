import { defineConfig } from 'vite';
import type { ViteDevServer, PluginOption } from 'vite';
import { execFileSync, execSync } from 'child_process';
import type { RollupInjectOptions } from '@rollup/plugin-inject';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import * as injectModule from '@rollup/plugin-inject';
import * as topLevelAwaitModule from 'vite-plugin-top-level-await';
import type { Options as TopLevelAwaitOptions } from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import { constants as zlibConstants } from 'zlib';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import buildConfig from './build.config.ts';

const inject = injectModule.default as unknown as (options?: RollupInjectOptions) => PluginOption;
const topLevelAwait = topLevelAwaitModule.default as unknown as (
  options?: TopLevelAwaitOptions
) => PluginOption;

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as {
  version: string;
};

const normalizeShortSha = (value?: string): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 7);
};

const resolveBuildHash = (): string | undefined => {
  const envHash = normalizeShortSha(
    process.env.VITE_BUILD_HASH ??
      process.env.GITHUB_SHA ??
      process.env.CI_COMMIT_SHA ??
      process.env.SOURCE_VERSION
  );
  if (envHash) return envHash;
  try {
    return normalizeShortSha(execSync('git rev-parse --short HEAD').toString('utf8'));
  } catch {
    return undefined;
  }
};

const appVersion = packageJson.version;
const buildHash = resolveBuildHash();

const isReleaseTag = (() => {
  const envVal = process.env.VITE_IS_RELEASE_TAG;
  if (envVal !== undefined && envVal !== '') return envVal === 'true';
  try {
    const tag = execFileSync('git', ['describe', '--exact-match', '--tags', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return tag.startsWith('v');
  } catch {
    return false;
  }
})();

const copyFiles = {
  targets: [
    {
      src: 'node_modules/@sableclient/sable-call-embedded/dist/*',
      dest: 'public/element-call',
    },
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: '',
      rename: 'pdf.worker.min.js',
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      src: 'public/manifest.json',
      dest: '',
    },
    {
      src: 'public/res/logo-maskable',
      dest: 'public/',
    },
    {
      src: 'public/res/logo',
      dest: 'public/',
    },
    {
      src: 'public/res/svg',
      dest: 'public/',
    },
    {
      src: 'public/locales',
      dest: 'public/',
    },
  ],
};

const require = createRequire(import.meta.url);

function serverMatrixSdkCryptoWasm() {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server: ViteDevServer) {
      const resolvedPath = path.join(
        path.dirname(require.resolve('@matrix-org/matrix-sdk-crypto-wasm')),
        'pkg/matrix_sdk_crypto_wasm_bg.wasm'
      );

      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('matrix_sdk_crypto_wasm_bg.wasm')) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/wasm');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(resolvedPath).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  appType: 'spa',
  publicDir: false,
  base: buildConfig.base,
  define: {
    APP_VERSION: JSON.stringify(appVersion),
    BUILD_HASH: JSON.stringify(buildHash ?? ''),
    IS_RELEASE_TAG: JSON.stringify(isReleaseTag),
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 8080,
    host: true,
    allowedHosts: command === 'serve' ? true : undefined,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    serverMatrixSdkCryptoWasm(),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i: number) => `__tla_${i}`,
    }),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin({ identifiers: 'debug' }),
    wasm() as PluginOption,
    react(),
    svgr(),
    VitePWA({
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
    compression({
      algorithms: [
        defineAlgorithm('brotliCompress', {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY },
        }),
      ],
      include: /\.(html|xml|css|json|js|mjs|svg|yaml|yml|toml|wasm|txt|map)$/,
    }),
    // Sentry source map upload — only active when credentials are provided at build time
    ...(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              filesToDeleteAfterUpload: ['dist/**/*.map'],
            },
            release: {
              name: appVersion,
            },
            // Annotate React components with data-sentry-* attributes at build
            // time so Sentry can show component names in breadcrumbs, spans,
            // and replay search instead of raw CSS selectors.
            reactComponentAnnotation: { enabled: true },
          }),
        ]
      : []),
  ],
  optimizeDeps: {
    // Rebuild dep optimizer cache on each dev start to avoid stale API shapes.
    force: true,
    // Keep matrix-widget-api prebundled so matrix-js-sdk can import its named exports in dev.
    // Force CJS interop for stability across optimizer cache rebuilds.
    include: [
      'matrix-widget-api',
      'workbox-precaching',
      '@vanilla-extract/recipes/createRuntimeFn',
    ],
    needsInterop: ['matrix-widget-api'],
    rolldownOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        // Enable esbuild polyfill plugins
        NodeGlobalsPolyfillPlugin({
          process: false,
          buffer: true,
        }),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
    },
  },
}));
