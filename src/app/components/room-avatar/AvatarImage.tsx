import { AvatarImage as FoldsAvatarImage } from 'folds';
import type { ReactEventHandler } from 'react';
import { useState, useEffect } from 'react';
import bgColorImg from '$utils/bgColorImg';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import * as css from './RoomAvatar.css';

// Module-level cache: maps a Matrix media URL → processed SVG text (or null
// for confirmed non-SVG). Storing text (not blob URLs) means cache eviction
// never revokes a blob URL that a still-mounted component is displaying.
// Blob URLs are created per component instance and revoked in their cleanup,
// so their lifetime is always tied to the component that owns them.
const SVG_TEXT_CACHE_MAX = 1000;
// null = confirmed non-SVG; string = processed SVG markup ready for Blob.
const svgTextCache = new Map<string, string | null>();

/** Number of entries currently held in the module-level SVG text cache. */
export function getSvgCacheSize(): number {
  return svgTextCache.size;
}

/** Clear the SVG text cache to free memory.
 *  Blob URLs are managed per-component and will be revoked when each
 *  AvatarImage / UserAvatar unmounts — nothing to revoke here.
 */
export function clearSvgBlobCache(): void {
  svgTextCache.clear();
}

/**
 * Resolves an avatar HTTP URL to a displayable src string.
 * - SVG images are fetched, animation-sanitised, converted to a blob URL, and
 *   the processed text is cached so subsequent mounts skip the network fetch.
 *   Each component instance owns its own blob URL and revokes it on unmount.
 * - Non-SVG images are returned unchanged.
 * - `undefined` src returns `undefined`.
 */
export function useProcessedAvatarSrc(src: string | undefined): string | undefined {
  const [processedSrc, setProcessedSrc] = useState<string | undefined>(src);

  useEffect(() => {
    if (!src) {
      setProcessedSrc(undefined);
      return;
    }

    let isMounted = true;
    // Each component instance tracks its own blob URL so cleanup can revoke it
    // without affecting any other mounted component showing the same image.
    let blobUrl: string | null = null;

    const makeBlobUrl = (svgText: string): string => {
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      blobUrl = url;
      return url;
    };

    // Reset to raw src first so any stale blob URL from a previous src is gone.
    setProcessedSrc(src);

    // Fast path: text cache hit — create a component-local blob URL immediately.
    const cachedText = svgTextCache.get(src);
    if (cachedText !== undefined) {
      if (cachedText !== null) {
        setProcessedSrc(makeBlobUrl(cachedText));
      }
      // null → confirmed non-SVG; processedSrc already set to src above.
      return () => {
        isMounted = false;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }

    const processImage = async () => {
      // Another concurrent call may have resolved the cache while we were
      // waiting for the async queue — check again before fetching.
      const alreadyCached = svgTextCache.get(src);
      if (alreadyCached !== undefined) {
        if (alreadyCached !== null && isMounted) {
          setProcessedSrc(makeBlobUrl(alreadyCached));
        }
        return;
      }

      try {
        // Fast path: if the URL has a non-SVG extension we can skip the fetch
        // entirely and let the browser's <img> element load it directly.
        const urlPath = src.split('?')[0]?.toLowerCase() ?? '';
        const hasSvgExtension = urlPath.endsWith('.svg');
        const hasNonSvgExtension = /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/.test(urlPath);

        if (hasNonSvgExtension) {
          svgTextCache.set(src, null);
          // processedSrc is already src — nothing more to do.
          return;
        }

        const res = await fetch(src, { mode: 'cors' });
        const contentType = res.headers.get('content-type');
        const isSvg =
          hasSvgExtension || (contentType ? contentType.includes('image/svg+xml') : false);

        if (isSvg) {
          const text = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'image/svg+xml');

          const animations = doc.querySelectorAll('animate, animateTransform, animateMotion');
          animations.forEach((anim) => anim.setAttribute('repeatCount', 'indefinite'));

          const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
          style.textContent = '* { animation-iteration-count: infinite !important; }';
          doc.documentElement.appendChild(style);

          const serializer = new XMLSerializer();
          const svgString = serializer.serializeToString(doc);

          // Evict oldest entry if cache is full. Safe to just delete — there are
          // no blob URLs stored here, so no revocation needed.
          if (svgTextCache.size >= SVG_TEXT_CACHE_MAX) {
            const firstKey = svgTextCache.keys().next().value;
            if (firstKey !== undefined) svgTextCache.delete(firstKey);
          }
          svgTextCache.set(src, svgString);

          if (isMounted) {
            setProcessedSrc(makeBlobUrl(svgString));
          }
          // If unmounted: text is cached for the next mount; no blob URL created.
        } else {
          svgTextCache.set(src, null);
          // processedSrc is already src.
        }
      } catch {
        if (isMounted) setProcessedSrc(src);
      }
    };

    processImage();

    return () => {
      isMounted = false;
      // Revoke the blob URL owned by this component instance.
      if (blobUrl) URL.revokeObjectURL(blobUrl);
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
  const processedSrc = useProcessedAvatarSrc(src) ?? src;

  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const normalizedBg = useUniformIcons && image ? bgColorImg(image) : undefined;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setImage(evt.currentTarget);
  };

  const isBlobUrl = processedSrc.startsWith('blob:');

  return (
    <FoldsAvatarImage
      className={css.RoomAvatar}
      style={{ backgroundColor: useUniformIcons ? normalizedBg : undefined }}
      src={processedSrc}
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
