import type { ComponentProps, ForwardedRef, ImgHTMLAttributes, PointerEventHandler } from 'react';
import { forwardRef, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import type { DotLottieReact as DotLottieReactComponent } from '@lottiefiles/dotlottie-react';
import { useSetting } from '$state/hooks/settings';
import { isPixelatedRendering, settingsAtom } from '$state/settings';
import * as css from './media.css';
import type { IImageInfo } from '$types/matrix/common';

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'onPointerDown'> & {
  info?: IImageInfo;
  mimeType?: string;
  disableDefaultSizing?: boolean;
  disablePixelation?: boolean;
  pixelated?: boolean;
  onLottieLoad?: (canvas?: HTMLCanvasElement) => void;
  onLottieError?: () => void;
  onPointerDown?: PointerEventHandler<HTMLElement>;
};

type LottieDotProps = Omit<
  ComponentProps<typeof DotLottieReactComponent>,
  'src' | 'data' | 'alt' | 'loading' | 'onPointerDown'
>;
type DotLottieInstance = Parameters<
  NonNullable<ComponentProps<typeof DotLottieReactComponent>['dotLottieRefCallback']>
>[0];

const DotLottieReact = lazy(() =>
  Promise.all([
    import('@lottiefiles/dotlottie-react'),
    import('@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'),
  ]).then(([module, wasm]) => {
    module.setWasmUrl(wasm.default);
    return { default: module.DotLottieReact };
  })
) as typeof DotLottieReactComponent;

const GZIPPED_LOTTIE_MIME = /^application\/(?:(?:x-)?gzip|x-tgsticker)(?:;|$)/i;
const MAX_COMPRESSED_LOTTIE_BYTES = 1024 * 1024;
const MAX_DECOMPRESSED_LOTTIE_BYTES = 8 * 1024 * 1024;
const MAX_LOTTIE_DIMENSION = 4096;
const MAX_LOTTIE_FRAMES = 10_000;
const MAX_LOTTIE_LAYERS = 1_000;
const MAX_LOTTIE_NODES = 50_000;
const MAX_LOTTIE_DEPTH = 64;
const LOTTIE_PROBE_TIMEOUT_MS = 5_000;
const MAX_LOTTIE_CACHE_ENTRIES = 32;
const MAX_CACHED_LOTTIE_JSON_LENGTH = 2 * 1024 * 1024;
const UNSAFE_LOTTIE_KEYS = new Set([
  'expression',
  'expressions',
  'script',
  'scripts',
  'javascript',
  'onload',
  'onclick',
]);

export function processAndSanitizeLottie(root: unknown): string | null {
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const lottie = root as Record<string, unknown>;

  if (!('v' in lottie)) return null;
  const width = Number(lottie.w);
  const height = Number(lottie.h);
  const firstFrame = Number(lottie.ip);
  const lastFrame = Number(lottie.op);
  if (
    (Number.isFinite(width) && (width <= 0 || width > MAX_LOTTIE_DIMENSION)) ||
    (Number.isFinite(height) && (height <= 0 || height > MAX_LOTTIE_DIMENSION)) ||
    (Number.isFinite(firstFrame) &&
      Number.isFinite(lastFrame) &&
      (lastFrame <= firstFrame || lastFrame - firstFrame > MAX_LOTTIE_FRAMES))
  ) {
    return null;
  }

  let totalNodes = 0;
  let layerCount = 0;

  const rootClone = Object.create(null) as Record<string, unknown>;
  const stack: {
    parent: Record<string, unknown> | unknown[];
    key: string | number;
    value: unknown;
    depth: number;
  }[] = [{ parent: rootClone, key: 'root', value: root, depth: 0 }];

  const canEnqueue = (count: number): boolean =>
    totalNodes + stack.length + count <= MAX_LOTTIE_NODES;

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) continue;
    const { parent, key, value, depth } = item;

    totalNodes++;
    if (totalNodes > MAX_LOTTIE_NODES || depth > MAX_LOTTIE_DEPTH) return null;

    if (Array.isArray(value)) {
      if (!canEnqueue(value.length)) return null;

      const newArray: unknown[] = [];
      if (Array.isArray(parent)) {
        parent[key as number] = newArray;
      } else {
        (parent as Record<string, unknown>)[key as string] = newArray;
      }
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ parent: newArray, key: i, value: value[i], depth: depth + 1 });
      }
    } else if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).filter(
        ([k, child]) => !UNSAFE_LOTTIE_KEYS.has(k) && !(k === 'x' && typeof child === 'string')
      );

      for (const [k, child] of entries) {
        if (k === 'layers' && Array.isArray(child)) {
          layerCount += child.length;
          if (layerCount > MAX_LOTTIE_LAYERS) return null;
        }
      }

      if (!canEnqueue(entries.length)) return null;

      const newObj = Object.create(null) as Record<string, unknown>;
      if (Array.isArray(parent)) {
        parent[key as number] = newObj;
      } else {
        (parent as Record<string, unknown>)[key as string] = newObj;
      }

      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (!entry) continue;
        const [k, child] = entry;
        stack.push({ parent: newObj, key: k, value: child, depth: depth + 1 });
      }
    } else {
      if (Array.isArray(parent)) {
        parent[key as number] = value;
      } else {
        (parent as Record<string, unknown>)[key as string] = value;
      }
    }
  }

  const sanitized = rootClone.root;
  return JSON.stringify(sanitized);
}

function isGzippedLottieCandidate(
  src: string | undefined,
  mimeType: string | undefined,
  name: string | undefined
): src is string {
  if (!src) return false;
  return (
    GZIPPED_LOTTIE_MIME.test(mimeType ?? '') ||
    /^data:application\/(?:(?:x-)?gzip|x-tgsticker);base64,/i.test(src) ||
    [name, src].some((value) => value?.toLowerCase().split(/[?#]/, 1)[0]?.endsWith('.tgs'))
  );
}

async function readBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let completed = false;

  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      // Stream chunks must be consumed sequentially to enforce the running byte limit.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      size += value.byteLength;
      if (size > limit) throw new Error('Lottie data exceeds the size limit');
      chunks.push(value);
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

async function loadBytes(src: string, signal: AbortSignal): Promise<Uint8Array | null> {
  const encoded = src.match(/^data:[^;,]*;base64,(.+)$/i)?.[1];
  if (encoded) {
    if (encoded.length > Math.ceil((MAX_COMPRESSED_LOTTIE_BYTES * 4) / 3) + 4) return null;
    return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  }

  const response = await fetch(src, { credentials: 'include', signal });
  if (!response.ok || !response.body) return null;
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_COMPRESSED_LOTTIE_BYTES) return null;
  return readBytes(response.body, MAX_COMPRESSED_LOTTIE_BYTES, signal);
}

async function resolveLottieJson(src: string, signal: AbortSignal): Promise<string | null> {
  try {
    const bytes = await loadBytes(src, signal);
    if (!bytes || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return null;

    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    const decompressed = await readBytes(stream, MAX_DECOMPRESSED_LOTTIE_BYTES, signal);
    const parsed = JSON.parse(new TextDecoder().decode(decompressed));
    return processAndSanitizeLottie(parsed);
  } catch {
    return null;
  }
}

const resolvedLottieCache = new Map<string, string>();
const inFlightLottieLoads = new Map<string, Promise<string | null>>();

function trimResolvedCache(): void {
  while (resolvedLottieCache.size > MAX_LOTTIE_CACHE_ENTRIES) {
    const oldest = resolvedLottieCache.keys().next().value;
    if (oldest !== undefined) {
      resolvedLottieCache.delete(oldest);
    } else {
      break;
    }
  }
}

function resolveCachedLottieJson(src: string): Promise<string | null> {
  const cached = resolvedLottieCache.get(src);
  if (cached !== undefined) {
    resolvedLottieCache.delete(src);
    resolvedLottieCache.set(src, cached);
    return Promise.resolve(cached);
  }

  const existing = inFlightLottieLoads.get(src);
  if (existing) return existing;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LOTTIE_PROBE_TIMEOUT_MS);

  const promise = resolveLottieJson(src, controller.signal)
    .then((result) => {
      if (result !== null && result.length <= MAX_CACHED_LOTTIE_JSON_LENGTH) {
        resolvedLottieCache.set(src, result);
        trimResolvedCache();
      }
      return result;
    })
    .finally(() => {
      window.clearTimeout(timeout);
      inFlightLottieLoads.delete(src);
    });

  inFlightLottieLoads.set(src, promise);
  return promise;
}

type LottieImageProps = LottieDotProps & {
  data: string;
  alt?: string;
  emoticon?: boolean;
  onLottieLoad?: (canvas?: HTMLCanvasElement) => void;
  onLottieError?: () => void;
  pixelated?: boolean;
  forwardedRef?: ForwardedRef<HTMLImageElement | HTMLCanvasElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
};

function LottieImage({
  data,
  alt,
  emoticon,
  className,
  style,
  onLottieLoad,
  onLottieError,
  pixelated,
  forwardedRef,
  onPointerDown,
  ...props
}: Readonly<LottieImageProps>) {
  const [player, setPlayer] = useState<DotLottieInstance>(null);
  const callbacks = useRef({ onLottieLoad, onLottieError });
  const pixelation = useRef(pixelated);
  callbacks.current = { onLottieLoad, onLottieError };
  pixelation.current = pixelated;

  const setForwardedRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (typeof forwardedRef === 'function') forwardedRef(canvas);
      else if (forwardedRef) forwardedRef.current = canvas;
    },
    [forwardedRef]
  );

  useEffect((): (() => void) | undefined => {
    if (!player) {
      setForwardedRef(null);
      return undefined;
    }

    const canvas = player.canvas as HTMLCanvasElement;
    if (canvas) {
      setForwardedRef(canvas);
    }

    const handleLoad = () => {
      if (canvas) {
        canvas.style.imageRendering = pixelation.current ? 'pixelated' : 'auto';
      }
      callbacks.current.onLottieLoad?.(canvas);
    };

    const handleError = () => {
      callbacks.current.onLottieError?.();
    };

    player.addEventListener('load', handleLoad);
    player.addEventListener('loadError', handleError);

    if (player.isLoaded) {
      handleLoad();
    }

    return () => {
      player.removeEventListener('load', handleLoad);
      player.removeEventListener('loadError', handleError);
      setForwardedRef(null);
    };
  }, [player, setForwardedRef]);

  useEffect(() => {
    if (player?.canvas) {
      (player.canvas as HTMLCanvasElement).style.imageRendering = pixelated ? 'pixelated' : 'auto';
    }
  }, [player, pixelated]);

  return (
    <Suspense fallback={null}>
      <div
        className={className}
        style={{
          width: '100%',
          height: '100%',
          ...style,
          ...(emoticon ? { width: '1em', height: '1em' } : undefined),
        }}
        onPointerDown={onPointerDown}
      >
        <DotLottieReact
          {...props}
          data={data}
          style={{
            width: '100%',
            height: '100%',
            ...(emoticon ? { width: '1em', height: '1em' } : undefined),
          }}
          aria-label={props['aria-label'] ?? alt}
          backgroundColor="#00000000"
          dotLottieRefCallback={setPlayer}
        />
      </div>
    </Suspense>
  );
}

export const Image = forwardRef<HTMLImageElement | HTMLCanvasElement, ImageProps>(
  (
    {
      className,
      alt,
      info,
      mimeType,
      disableDefaultSizing,
      disablePixelation,
      loading = 'lazy',
      decoding = 'async',
      onLoad,
      onPointerDown,
      src,
      style,
      onError,
      onLottieLoad,
      onLottieError,
      pixelated,
      ...props
    },
    ref
  ) => {
    const [pixelatedImageRendering] = useSetting(settingsAtom, 'pixelatedImageRendering');
    const [lottieResolution, setLottieResolution] = useState<{
      source: string;
      resolved: string | null;
    }>();
    const [fallbackSource, setFallbackSource] = useState<string>();

    const lottieProps = props as LottieDotProps;
    const emoticon = 'data-mx-emoticon' in props;
    const declaredLottieCandidate = isGzippedLottieCandidate(
      src,
      mimeType ?? info?.mimetype,
      typeof props.title === 'string' ? props.title : alt
    );
    const isLottieCandidate = declaredLottieCandidate || fallbackSource === src;
    const resolvedLottieJson =
      isLottieCandidate && lottieResolution?.source === src
        ? (lottieResolution?.resolved ?? null)
        : isLottieCandidate
          ? undefined
          : null;
    const imageClass = classNames(
      !disableDefaultSizing && css.Image,
      !disablePixelation &&
        (pixelated ?? isPixelatedRendering(pixelatedImageRendering, info)) &&
        css.ImagePixelated,
      className
    );

    useEffect(() => {
      let active = true;

      if (isLottieCandidate && src) {
        void resolveCachedLottieJson(src).then((result) => {
          if (active) {
            setLottieResolution({ source: src, resolved: result });
          }
        });
      }

      return () => {
        active = false;
      };
    }, [isLottieCandidate, src]);

    useEffect(() => {
      setFallbackSource(undefined);
    }, [src]);

    // A lottie candidate is not an image request until it resolves to non-animation data.
    const renderedSrc = resolvedLottieJson === null ? src : undefined;
    const pending = src !== undefined && renderedSrc === undefined;

    const shouldRenderLottie = typeof resolvedLottieJson === 'string';

    if (shouldRenderLottie) {
      return (
        <LottieImage
          {...lottieProps}
          className={imageClass}
          style={style}
          data={resolvedLottieJson}
          emoticon={emoticon}
          alt={alt}
          onLottieLoad={onLottieLoad}
          onLottieError={onLottieError}
          forwardedRef={ref}
          onPointerDown={onPointerDown}
          pixelated={
            !disablePixelation && (pixelated ?? isPixelatedRendering(pixelatedImageRendering, info))
          }
          loop
          autoplay
        />
      );
    }

    return (
      <img
        className={imageClass}
        alt={alt}
        loading={loading}
        decoding={decoding}
        src={renderedSrc}
        aria-busy={pending ? true : undefined}
        style={pending ? { ...style, visibility: 'hidden' } : style}
        onLoad={onLoad}
        onPointerDown={onPointerDown}
        onError={(event) => {
          if (!declaredLottieCandidate && fallbackSource !== src) {
            setFallbackSource(src);
            return;
          }
          onError?.(event);
        }}
        {...props}
        ref={ref as ForwardedRef<HTMLImageElement>}
      />
    );
  }
);
