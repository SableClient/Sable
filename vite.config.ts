import { defineConfig } from 'vite';
import type { ViteDevServer, PluginOption } from 'vite';
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
import { createRequire } from 'module';
import { sentryVitePlugin } from '@sentry/vite-plugin';
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

const injectedExperimentFlags: Record<string, boolean> = Object.fromEntries(
  Object.entries(process.env)
    .filter(([k]) => k.startsWith('VITE_FEATURE_'))
    .map(([k, v]) => [
      k.slice('VITE_FEATURE_'.length).toLowerCase().replace(/_/g, '-'),
      v === 'true' || v === '1',
    ])
);

const isReleaseTag = (() => {
  const envVal = process.env.VITE_IS_RELEASE_TAG;
  if (envVal !== undefined && envVal !== '') return envVal === 'true';
  try {
    const tag = execSync('git describe --exact-match --tags HEAD 2>/dev/null').toString().trim();
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
      src: 'public/_headers',
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

function patchServiceWorkerDocumentShim(): PluginOption {
  let outDir = '';

  return {
    name: 'vite-plugin-patch-sw-document-shim',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const documentShim =
        'const document = { currentScript: undefined, baseURI: self.location.href };';
      const swSource = await fs.promises.readFile(swPath, 'utf8');
      if (swSource.startsWith(documentShim)) return;

      await fs.promises.writeFile(swPath, `${documentShim}\n${swSource}`, 'utf8');
    },
  };
}

export default defineConfig(({ command }) => ({
  clearScreen: false,
  appType: 'spa',
  publicDir: false,
  base: buildConfig.base,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    APP_VERSION: JSON.stringify(appVersion),
    BUILD_HASH: JSON.stringify(buildHash ?? ''),
    IS_RELEASE_TAG: JSON.stringify(isReleaseTag),
    INJECTED_EXPERIMENT_FLAGS: JSON.stringify(injectedExperimentFlags),
  },
  resolve: {
    alias: {
      $hooks: path.resolve(__dirname, 'src/app/hooks'),
      $plugins: path.resolve(__dirname, 'src/app/plugins'),
      $components: path.resolve(__dirname, 'src/app/components'),
      $features: path.resolve(__dirname, 'src/app/features'),
      $app: path.resolve(__dirname, 'src/app'),
      $state: path.resolve(__dirname, 'src/app/state'),
      $styles: path.resolve(__dirname, 'src/app/styles'),
      $utils: path.resolve(__dirname, 'src/app/utils'),
      $pages: path.resolve(__dirname, 'src/app/pages'),
      $generated: path.resolve(__dirname, 'src/app/generated'),
      $types: path.resolve(__dirname, 'src/types'),
      $public: path.resolve(__dirname, 'public'),
      $client: path.resolve(__dirname, 'src/client'),
      $unstable: path.resolve(__dirname, 'src/unstable'),
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
      promiseImportName: (i) => `__tla_${i}`,
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
        // element-call is a self-contained embedded app; exclude its large assets
        // from the SW precache manifest (they are not part of the Sable shell).
        globIgnores: ['public/element-call/**'],
        // The app's own crypto WASM and main bundle exceed the 2 MiB default.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
        // Keep the production worker compatible with browsers that still lack
        // module service worker support, notably Firefox.
        rollupFormat: 'iife',
        buildPlugins: {
          vite: [patchServiceWorkerDocumentShim()],
        },
        // SABLE-5G: Ensure web worker chunks (e.g., search-worker-XXXXX.js) are
        // included in the precache manifest. Vite's ?worker suffix builds workers
        // as separate chunks with hashed filenames, and injectManifest should
        // automatically include them via globPatterns. If worker imports fail at
        // runtime with 404 errors, verify the worker chunk appears in the manifest.
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
        globIgnores: [
          '**/matrix_sdk_crypto_wasm_bg-*.wasm',
          '**/vision_wasm_internal-*.wasm',
          '**/qcms_bg.wasm',
          '**/openjpeg.wasm',
          '**/jbig2.wasm',
        ],
      },
    }),
    ...(!isTauriBuild
      ? [
          cloudflare({
            config: {
              compatibility_date: '2026-03-03',
              main: './worker/index.ts',
              observability: {
                enabled: true,
                head_sampling_rate: 1,
                logs: {
                  enabled: true,
                  destinations: ['sentry-logs'],
                  head_sampling_rate: 1,
                  persist: true,
                  invocation_logs: true,
                },
                traces: {
                  enabled: true,
                  destinations: ['sentry-traces'],
                  persist: true,
                  head_sampling_rate: 1,
                },
              },
              assets: {
                not_found_handling: 'single-page-application',
                binding: 'ASSETS',
                run_worker_first: true,
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
        ]
      : []),
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
    // Include service worker entry so worker-only imports are discovered during startup.
    entries: ['index.html', 'src/sw.ts'],
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
    target: isTauriBuild ? tauriBuildTarget : 'es2022',
    minify: isTauriBuild ? tauriBuildMinify : undefined,
    sourcemap: isTauriBuild ? isTauriDebug : true,
    outDir: 'dist',
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] }) as PluginOption],
      output: {
        manualChunks: (id) => {
          if (id.includes('pdfjs-dist')) return 'pdf';
          if (id.includes('@sableclient/sable-call-embedded')) return 'element-call';
          if (id.includes('@matrix-org') || id.includes('matrix-js-sdk')) return 'matrix';
          if (id.includes('/slate-react/') || id.includes('/slate-dom/')) {
            return 'composer';
          }
          if (
            id.includes('/src/app/components/editor/') ||
            id.includes('/src/app/features/room/RoomInput') ||
            id.includes('/src/app/hooks/useCommands.ts') ||
            id.includes('/src/app/plugins/text-area/') ||
            id.includes('dompurify') ||
            id.includes('marked') ||
            id.includes('linkifyjs') ||
            id.includes('html-react-parser') ||
            id.includes('html-dom-parser') ||
            id.includes('/src/app/plugins/markdown/') ||
            id.includes('/src/app/plugins/react-custom-html-parser.tsx')
          ) {
            return 'composer';
          }
          if (id.includes('react-prism') || id.includes('prism')) return 'prism';
          return undefined;
        },
      },
    },
  },
}));
