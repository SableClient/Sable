import { defineConfig } from 'vite';
import type { ViteDevServer, PluginOption } from 'vite';
import { execSync } from 'child_process';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import nodePolyfills from '@rolldown/plugin-node-polyfills';
import inject from '@rollup/plugin-inject';
import { VitePWA } from 'vite-plugin-pwa';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import { constants as zlibConstants } from 'zlib';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import buildConfig from './build.config';

const appConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8')
) as Record<string, unknown>;

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

const appVersion = process.env.VITE_APP_VERSION || packageJson.version;
const buildHash = resolveBuildHash();
const tauriDevHost = process.env.TAURI_DEV_HOST;
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);
const isTauriDebug = process.env.TAURI_ENV_DEBUG === 'true';
const tauriBuildMinify = !isTauriDebug ? 'esbuild' : false;
const desktopUpdaterEnabled = process.env.VITE_DESKTOP_UPDATER_ENABLED !== 'false';
const sentryUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
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

const baseProductName = typeof appConfig.productName === 'string' ? appConfig.productName : 'Sable';

const callEmbeddedDir = 'node_modules/@sableclient/sable-call-embedded/dist';

const copyFiles = {
  targets: [
    {
      src: callEmbeddedDir,
      dest: 'public/element-call',
      rename: { stripBase: callEmbeddedDir.split('/').length },
    },
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: '.',
      rename: { name: 'pdf.worker.min.js', stripBase: true as const },
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      src: 'public/manifest.json',
      dest: '',
      rename: { name: 'manifest.json', stripBase: true as const },
    },
    {
      src: 'public/res/logo-maskable',
      dest: 'public/',
      rename: { stripBase: 2 },
    },
    {
      src: 'public/res/logo',
      dest: 'public/',
      rename: { stripBase: 2 },
    },
    {
      src: 'public/res/svg',
      dest: 'public/',
      rename: { stripBase: 2 },
    },
    {
      src: 'public/locales',
      dest: 'public/',
      rename: { stripBase: 1 },
    },
    {
      src: 'wrangler.json',
      dest: '',
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

export default defineConfig(({ command }) => {
  const buildFlavor = process.env.SABLE_BUILD_FLAVOR || (command === 'serve' ? 'dev' : 'stable');

  return {
    clearScreen: false,
    appType: 'spa',
    publicDir: false,
    base: buildConfig.base,
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    define: {
      APP_VERSION: JSON.stringify(appVersion),
      BUILD_HASH: JSON.stringify(buildHash ?? ''),
      IS_RELEASE_TAG: JSON.stringify(isReleaseTag),
      SABLE_PRODUCT_NAME: JSON.stringify(baseProductName),
      SABLE_BUILD_FLAVOR: JSON.stringify(buildFlavor),
      DESKTOP_UPDATER_ENABLED: JSON.stringify(desktopUpdaterEnabled),
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
        $unstable: path.resolve(__dirname, 'src/unstable'),
        $app: path.resolve(__dirname, 'src/app'),
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
          globIgnores: ['public/element-call/**', 'assets/lottie-*.js'],
          // The app's own crypto WASM and main bundle exceed the 2 MiB default.
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
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
            compression({
              algorithms: [
                defineAlgorithm('brotliCompress', {
                  params: {
                    [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
                  },
                }),
              ],
              include: /\.(html|xml|css|json|js|mjs|svg|yaml|yml|toml|wasm|txt|map)$/,
            }),
          ]
        : []),
      // Sentry source map upload 窶・only active when credentials are provided at build time
      ...(sentryUploadEnabled
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
      rolldownOptions: {
        transform: {
          define: {
            global: 'globalThis',
          },
        },
        plugins: [nodePolyfills()],
      },
    },
    build: {
      target: 'es2022',
      minify: isTauriBuild ? tauriBuildMinify : undefined,
      sourcemap: isTauriBuild ? isTauriDebug || sentryUploadEnabled : true,
      outDir: 'dist',
      copyPublicDir: false,
      rollupOptions: {
        plugins: [inject({ Buffer: ['buffer', 'Buffer'] }) as PluginOption],
        output: {
          chunkFileNames: (chunk) =>
            chunk.moduleIds.some((id) => id.includes('@lottiefiles/dotlottie'))
              ? 'assets/lottie-[hash].js'
              : 'assets/[name]-[hash].js',
          manualChunks: (id) => {
            if (id.includes('@matrix-org') || id.includes('matrix-js-sdk')) return 'matrix';
            return undefined;
          },
        },
      },
    },
  };
});
