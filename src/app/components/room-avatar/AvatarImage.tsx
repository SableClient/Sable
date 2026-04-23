import { AvatarImage as FoldsAvatarImage } from 'folds';
import type { ReactEventHandler } from 'react';
import { useState, useEffect } from 'react';
import bgColorImg from '$utils/bgColorImg';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import * as css from './RoomAvatar.css';

type AvatarImageProps = {
  src: string;
  alt?: string;
  uniformIcons?: boolean;
  onError: () => void;
};

export function AvatarImage({ src, alt, uniformIcons, onError }: AvatarImageProps) {
  const [uniformIconsSetting] = useSetting(settingsAtom, 'uniformIcons');
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  const [processedSrc, setProcessedSrc] = useState<string>(src);

  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const normalizedBg = useUniformIcons && image ? bgColorImg(image) : undefined;

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    const processImage = async () => {
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

          objectUrl = URL.createObjectURL(blob);
          if (isMounted) setProcessedSrc(objectUrl);
        } else if (isMounted) setProcessedSrc(src);
      } catch {
        if (isMounted) setProcessedSrc(src);
      }
    };

    processImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

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
