import { defineConfig } from 'vite';
import type { ViteDevServer } from 'vite';
import { execSync } from 'child_process';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import { constants as zlibConstants } from 'zlib';
import fs from 'fs';
import path from 'path';
import { cloudflare } from '@cloudflare/vite-plugin';
import buildConfig from './build.config';

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
const tauriDevHost = process.env.TAURI_DEV_HOST;
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);
const isTauriDebug = process.env.TAURI_ENV_DEBUG === 'true';
const tauriBuildTarget = process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13';
const tauriBuildMinify = !isTauriDebug ? 'esbuild' : false;

const isReleaseTag = (() => {
  const envVal = process.env.VITE_IS_RELEASE_TAG;
  if (envVal !== undefined && envVal !== '') return envVal === 'true';
  try {
    const tag = execSync('git describe --exact-match --tags HEAD 2>/dev/null').toString().trim();
    return tag.startsWith('sable/v');
  } catch {
    return false;
  }
})();

const copyFiles = {
  targets: [
    {
      src: 'node_modules/@element-hq/element-call-embedded/dist/*',
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
      src: 'public/res/android',
      dest: 'public/',
    },
    {
      src: 'public/locales',
      dest: 'public/',
    },
  ],
};

function serverMatrixSdkCryptoWasm(wasmFilePath: string) {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(
            path.resolve(),
            '/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'
          );

          if (fs.existsSync(resolvedPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');

            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
          } else {
            res.writeHead(404);
            res.end('File not found');
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  clearScreen: false,
  appType: 'spa',
  publicDir: false,
  base: buildConfig.base,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    APP_VERSION: JSON.stringify(appVersion),
    BUILD_HASH: JSON.stringify(buildHash ?? ''),
    IS_RELEASE_TAG: JSON.stringify(isReleaseTag),
  },
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
      $generated: path.resolve(__dirname, 'src/app/generated'),
      $types: path.resolve(__dirname, 'src/types'),
      $public: path.resolve(__dirname, 'public'),
      $client: path.resolve(__dirname, 'src/client'),
    },
  },
  server: {
    port: 8080,
    strictPort: true,
    host: tauriDevHost || true,
    hmr: tauriDevHost
      ? {
          protocol: 'ws',
          host: tauriDevHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin({ identifiers: 'debug' }),
    wasm(),
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
    cloudflare({
      config: {
        compatibility_date: '2026-03-03',
        assets: {
          not_found_handling: 'single-page-application',
        },
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
  ],
  optimizeDeps: {
    // Include service worker entry so worker-only imports are discovered during startup.
    entries: ['index.html', 'src/sw.ts'],
    // Rebuild dep optimizer cache on each dev start to avoid stale API shapes.
    force: true,
    // Keep matrix-widget-api prebundled so matrix-js-sdk can import its named exports in dev.
    // Force CJS interop for stability across optimizer cache rebuilds.
    include: [
      'matrix-widget-api',
      'workbox-precaching',
      'workbox-core',
      'workbox-routing',
      'workbox-strategies',
    ],
    needsInterop: ['matrix-widget-api'],
    esbuildOptions: {
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
    target: isTauriBuild ? tauriBuildTarget : undefined,
    minify: isTauriBuild ? tauriBuildMinify : undefined,
    sourcemap: isTauriBuild ? isTauriDebug : true,
    outDir: 'dist',
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
    },
  },
});
