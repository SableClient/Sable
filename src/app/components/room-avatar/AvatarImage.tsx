import { AvatarImage as FoldsAvatarImage } from 'folds';
import type { ReactEventHandler } from 'react';
import { useState, useEffect } from 'react';
import bgColorImg from '$utils/bgColorImg';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import * as css from './RoomAvatar.css';

// Module-level cache: maps a Matrix media URL → processed blob URL so that
// SVG processing only runs once per unique image, even as virtual-list items
// unmount and remount. MXC URLs are content-addressed and never change, so
// the mapping is stable for the lifetime of the page.
const svgBlobCache = new Map<string, string>();

/**
 * Hook to process avatar images, specifically handling SVG animations.
 * Shares a module-level cache to avoid redundant processing.
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
      // Return the cached blob URL immediately — no network round-trip needed.
      const cachedBlobUrl = svgBlobCache.get(src);
      if (cachedBlobUrl) {
        setProcessedSrc(cachedBlobUrl);
        return;
      }

      try {
        const res = await fetch(src, { mode: 'cors' });
        const contentType = res.headers.get('content-type');

        if (contentType && contentType.includes('image/svg+xml')) {
          const text = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'image/svg+xml');

          const animations = doc.querySelectorAll('animate, animateTransform, animateMotion');
          animations.forEach((anim) => anim.setAttribute('repeatCount', 'indefinite'));

          const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
          style.textContent = '* { animation-iteration-count: infinite !important; }';
          doc.documentElement.appendChild(style);

          const serializer = new XMLSerializer();
          const newSvgString = serializer.serializeToString(doc);
          const blob = new Blob([newSvgString], { type: 'image/svg+xml' });

          const blobUrl = URL.createObjectURL(blob);
          // Store in module cache so future remounts skip processing.
          svgBlobCache.set(src, blobUrl);
          if (isMounted) setProcessedSrc(blobUrl);
        } else if (isMounted) setProcessedSrc(src);
      } catch {
        if (isMounted) setProcessedSrc(src);
      }
    };

    processImage();

    return () => {
      isMounted = false;
      // Blob URLs are retained in svgBlobCache — do not revoke them here so
      // that subsequent remounts can use the cached result without re-fetching.
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

  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const normalizedBg = useUniformIcons && image ? bgColorImg(image) : undefined;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setImage(evt.currentTarget);
  };

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

/**
 * Get the current size of the SVG blob cache (number of cached URLs).
 */
export function getSvgCacheSize(): number {
  return svgBlobCache.size;
}

/**
 * Clear all cached SVG blob URLs and revoke the blob URLs to free memory.
 */
export function clearSvgBlobCache(): void {
  svgBlobCache.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
  svgBlobCache.clear();
}
