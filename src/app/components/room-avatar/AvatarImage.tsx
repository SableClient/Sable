import { AvatarImage as FoldsAvatarImage } from 'folds';
import type { ReactEventHandler } from 'react';
import { useState, useEffect } from 'react';
import bgColorImg from '$utils/bgColorImg';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import { fetch } from '$utils/fetch';
import * as css from './RoomAvatar.css';

const AVATAR_CACHE_NAME = 'sable-avatars-v1';

export function AvatarImage({ src, alt, uniformIcons, onError }: AvatarImageProps) {
  const [uniformIconsSetting] = useSetting(settingsAtom, 'uniformIcons');
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  const resolvedSrc = useRenderableMediaUrl(src);
  const mediaSrc = resolvedSrc ?? src;
  const [processedSrc, setProcessedSrc] = useState<string>(mediaSrc);

// -------------------------------------------------------------------------
// Persistent Cache API helpers
// -------------------------------------------------------------------------

async function getAvatarFromPersistentCache(src: string): Promise<Blob | undefined> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME);
    const response = await cache.match(src);
    if (!response) return undefined;
    return await response.blob();
  } catch {
    return undefined;
  }
}

async function storeAvatarInPersistentCache(src: string, blob: Blob): Promise<void> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME);
    await cache.put(
      src,
      new Response(blob, {
        headers: {
          'Content-Type': blob.type,
          'X-Size': blob.size.toString(),
        },
      })
    );
  } catch {
    // Quota exceeded or storage unavailable — continue without persisting
  }
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Get avatar cache statistics from the persistent Cache API store.
 * Counts entries and sums their stored sizes.
 */
export async function getAvatarCacheStatsAsync(): Promise<{ count: number; sizeMB: number }> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME);
    const requests = await cache.keys();
    const responses = await Promise.all(requests.map((r) => cache.match(r)));
    const totalBytes = responses.reduce((sum, resp) => {
      if (!resp) return sum;
      return sum + parseInt(resp.headers.get('X-Size') ?? '0', 10);
    }, 0);
    return { count: requests.length, sizeMB: totalBytes / (1024 * 1024) };
  } catch {
    return { count: avatarBlobCache.size, sizeMB: 0 };
  }
}

/**
 * Get the number of avatars held in the in-memory cache this session.
 */
export function getAvatarCacheSize(): number {
  return avatarBlobCache.size;
}

/**
 * Clear all avatar caches: revoke in-memory blob URLs and delete the
 * persistent on-device store.
 */
export async function clearAvatarCache(): Promise<void> {
  avatarBlobCache.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
  avatarBlobCache.clear();
  try {
    await caches.delete(AVATAR_CACHE_NAME);
  } catch {
    // ignore
  }
}

/**
 * Hook to fetch and cache avatar images of any type.
 *
 * Caching layers (fastest → slowest):
 *   1. In-memory Map  — instant, lives for this page session
 *   2. Cache API      — fast, survives page reloads (on-device)
 *   3. Network fetch  — SW adds Bearer auth; response stored in both layers
 *
 * SVG avatars are additionally processed to ensure animations loop
 * indefinitely before being stored.
 */
export function useProcessedAvatarSrc(src?: string): string | undefined {
  const [processedSrc, setProcessedSrc] = useState<string | undefined>(src);

  useEffect(() => {
    if (!src) {
      setProcessedSrc(undefined);
      return () => {};
    }

    let isMounted = true;

    const processImage = async () => {
      try {
        const res = await fetch(mediaSrc, { mode: 'cors' });
        const contentType = res.headers.get('content-type');

      try {
        // Layer 2: persistent on-device cache.
        const persistedBlob = await getAvatarFromPersistentCache(src);
        if (persistedBlob) {
          const blobUrl = URL.createObjectURL(persistedBlob);
          avatarBlobCache.set(src, blobUrl);
          if (isMounted) setProcessedSrc(blobUrl);
          return;
        }

        // Layer 3: network fetch (SW intercepts and adds Bearer auth).
        const res = await fetch(src, { mode: 'cors' });
        const contentType = res.headers.get('content-type') ?? '';

        let blob: Blob;

        if (contentType.includes('image/svg+xml')) {
          // Process SVG to ensure animations loop indefinitely.
          const text = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'image/svg+xml');

          const animations = doc.querySelectorAll('animate, animateTransform, animateMotion');
          animations.forEach((anim) => anim.setAttribute('repeatCount', 'indefinite'));

          const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
          style.textContent = '* { animation-iteration-count: infinite !important; }';
          doc.documentElement.appendChild(style);

          const serializer = new XMLSerializer();
          blob = new Blob([serializer.serializeToString(doc)], { type: 'image/svg+xml' });
        } else {
          // Raster or other image type — use the raw fetched bytes.
          blob = await res.blob();
        }

          objectUrl = URL.createObjectURL(blob);
          if (isMounted) setProcessedSrc(objectUrl);
        } else if (isMounted) setProcessedSrc(mediaSrc);
      } catch {
        if (isMounted) setProcessedSrc(mediaSrc);
      }
    };

    processImage();

    return () => {
      isMounted = false;
      // Blob URLs are retained in avatarBlobCache — do not revoke them here so
      // that subsequent remounts can reuse the cached result without re-fetching.
    };
  }, [mediaSrc]);

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

  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const normalizedBg = useUniformIcons && image ? bgColorImg(image) : undefined;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setImage(evt.currentTarget);
  };

  // All processed sources are blob URLs — no CORS headers needed.
  const isBlobUrl = processedSrc?.startsWith('blob:') ?? false;

  return (
    <FoldsAvatarImage
      className={css.RoomAvatar}
      style={{ backgroundColor: useUniformIcons ? normalizedBg : undefined }}
      src={processedSrc ?? src}
      crossOrigin={isBlobUrl ? undefined : 'anonymous'}
      alt={alt}
      onError={() => {
        setImage(undefined);
        onError();
      }}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
