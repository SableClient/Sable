/* eslint-disable jsx-a11y/alt-text */
import { ReactEventHandler, ReactNode, useEffect, useState } from 'react';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';

type AuthenticatedImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string;
  fallback?: ReactNode;
};

export function AuthenticatedImg({ src, fallback, onError, ...props }: AuthenticatedImgProps) {
  const [failed, setFailed] = useState(false);
  const imageSrc = useRenderableMediaUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

  const handleError: ReactEventHandler<HTMLImageElement> = (event) => {
    setFailed(true);
    onError?.(event);
  };

  if (failed || !imageSrc) return <>{fallback}</>;

  return <img {...props} src={imageSrc} onError={handleError} />;
}
