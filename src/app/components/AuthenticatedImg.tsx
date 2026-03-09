/* eslint-disable jsx-a11y/alt-text */
import { useMediaSrc } from '$hooks/useMediaSrc';

type AuthenticatedImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

export function AuthenticatedImg({ src, ...props }: AuthenticatedImgProps) {
  const resolvedSrc = useMediaSrc(src);
  return <img {...props} src={resolvedSrc ?? src} />;
}
