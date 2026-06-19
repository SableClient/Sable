import { AvatarImage as FoldsAvatarImage } from 'folds';
import type { ReactEventHandler } from 'react';
import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import bgColorImg from '$utils/bgColorImg';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { fetchMediaBlob } from '$utils/mediaTransport';
import * as css from './RoomAvatar.css';

// Module-level in-memory cache: maps a Matrix media URL -> blob URL so that
// avatars of any type only need to be fetched once per session. MXC URLs are
// content-addressed and never change, so this mapping is stable for the
// lifetime of the page and eliminates N+1 fetches as virtual-list items
// unmount and remount.
const avatarBlobCache = new Map<string, string>();
const avatarInflightCache = new Map<string, Promise<string>>();

export function getProcessedAvatarCacheStats(): { cacheSize: number } {
  return { cacheSize: avatarBlobCache.size };
}

/**
 * Clear processed avatar object URLs held for this page session.
 * Persistent avatar bytes live in the shared media cache.
 */
export function clearProcessedAvatarCache(): void {
  avatarBlobCache.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
  avatarBlobCache.clear();
  avatarInflightCache.clear();
}

/**
 * Hook to fetch and cache avatar images of any type.
 *
 * Caching layers (fastest → slowest):
 *   1. In-memory Map  — instant, lives for this page session
 *   2. Shared media cache — fast, survives page reloads (on-device)
 *   3. Network fetch — SW or direct auth adds Bearer auth
 *
 * SVG avatars are additionally processed to ensure animations loop
 * indefinitely before being stored.
 */
export function useProcessedAvatarSrc(src?: string): string | undefined {
  const [processedSrc, setProcessedSrc] = useState<string | undefined>(() =>
    src ? avatarBlobCache.get(src) : undefined
  );

  useEffect(() => {
    if (!src) {
      setProcessedSrc(undefined);
      return () => {};
    }

    let isMounted = true;
    setProcessedSrc(avatarBlobCache.get(src));

    const processImage = async () => {
      // Layer 1: in-memory hit — return immediately without any async work.
      const memCached = avatarBlobCache.get(src);
      if (memCached) {
        setProcessedSrc(memCached);
        return;
      }

      try {
        const inflight = avatarInflightCache.get(src);
        if (inflight) {
          const inflightBlobUrl = await inflight;
          if (isMounted) setProcessedSrc(inflightBlobUrl);
          return;
        }

        // Layer 2/3: authenticated media transport. This shares the app-wide
        // media cache and falls back to direct auth when the SW is not ready.
        const startedAt = performance.now();
        const fetchPromise = Sentry.startSpan({ name: 'avatar.resolve', op: 'media' }, async () => {
          const fetchedBlob = await fetchMediaBlob(src);
          const contentType = fetchedBlob.type;

          if (contentType.includes('image/svg+xml')) {
            // Process SVG to ensure animations loop indefinitely.
            const text = await fetchedBlob.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'image/svg+xml');

            const animations = doc.querySelectorAll('animate, animateTransform, animateMotion');
            animations.forEach((anim) => anim.setAttribute('repeatCount', 'indefinite'));

            const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.textContent = '* { animation-iteration-count: infinite !important; }';
            doc.documentElement.appendChild(style);

            const serializer = new XMLSerializer();
            const blob = new Blob([serializer.serializeToString(doc)], {
              type: 'image/svg+xml',
            });
            return URL.createObjectURL(blob);
          }

          return URL.createObjectURL(fetchedBlob);
        });
        avatarInflightCache.set(src, fetchPromise);
        const blobUrl = await fetchPromise;
        avatarBlobCache.set(src, blobUrl);
        Sentry.metrics.distribution(
          'sable.media.avatar_resolve_ms',
          performance.now() - startedAt,
          {
            attributes: { result: 'success' },
          }
        );
        if (isMounted) setProcessedSrc(blobUrl);
      } catch {
        // Network or processing failure — fall back to the original URL so the
        // browser can attempt a direct load (e.g. unauthenticated media).
        if (isMounted) setProcessedSrc(src);
      } finally {
        avatarInflightCache.delete(src);
      }
    };

    processImage();

    return () => {
      isMounted = false;
      // Blob URLs are retained in avatarBlobCache — do not revoke them here so
      // that subsequent remounts can reuse the cached result without re-fetching.
    };
  }, [src]);

  return processedSrc;
}

type AvatarImageProps = {
  src: string;
  alt?: string;
  uniformIcons?: boolean;
  onError: () => void;
};

export function AvatarImage({ src, alt, uniformIcons, onError }: AvatarImageProps) {
  const [uniformIconsSetting] = useSetting(settingsAtom, 'uniformIcons');
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  const processedSrc = useProcessedAvatarSrc(src);
  const resolvedSrc = processedSrc ?? src;

  // All processed sources are blob URLs — no CORS headers needed.
  const isBlobUrl = processedSrc?.startsWith('blob:') ?? false;

  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const hasCurrentImage = image?.getAttribute('src') === resolvedSrc;
  // Only extract colors from blob URLs (same-origin) to avoid tainted-canvas
  // errors.  bgColorImg itself also has a try-catch safety net.
  const normalizedBg =
    useUniformIcons && isBlobUrl && image && hasCurrentImage ? bgColorImg(image) : undefined;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setImage(evt.currentTarget);
  };

  return (
    <FoldsAvatarImage
      className={css.RoomAvatar}
      style={{ backgroundColor: useUniformIcons ? normalizedBg : undefined }}
      src={resolvedSrc}
      crossOrigin={isBlobUrl ? undefined : 'anonymous'}
      alt={alt}
      loading="lazy"
      onError={() => {
        setImage(undefined);
        onError();
      }}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
