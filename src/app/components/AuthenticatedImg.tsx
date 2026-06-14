/* eslint-disable jsx-a11y/alt-text */
import type { ReactEventHandler, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';

type AuthenticatedImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string;
  fallback?: ReactNode;
};

export function AuthenticatedImg({ src, fallback, onError, ...props }: AuthenticatedImgProps) {
  const placeholderRef = useRef<HTMLImageElement>(null);
  const shouldDeferLoad = props.loading === 'lazy';
  const [shouldLoad, setShouldLoad] = useState(!shouldDeferLoad);
  const [failed, setFailed] = useState(false);
  const imageSrc = useRenderableMediaUrl(shouldLoad ? src : undefined);

  useEffect(() => {
    setFailed(false);
    setShouldLoad(!shouldDeferLoad || !src);
  }, [shouldDeferLoad, src]);

  useEffect(() => {
    if (!shouldDeferLoad || shouldLoad || !src) return undefined;

    const element = placeholderRef.current;
    if (!element) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          return;
        }

        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: '160px' }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [shouldDeferLoad, shouldLoad, src]);

  const handleError: ReactEventHandler<HTMLImageElement> = (event) => {
    setFailed(true);
    onError?.(event);
  };

  if (shouldDeferLoad && !failed && !imageSrc) {
    return <img {...props} ref={placeholderRef} />;
  }

  if (failed || !imageSrc) return <>{fallback}</>;

  return <img {...props} src={imageSrc} onError={handleError} />;
}
