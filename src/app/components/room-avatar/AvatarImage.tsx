import { AvatarImage as FoldsAvatarImage } from 'folds';
import type { ReactEventHandler } from 'react';
import { useState } from 'react';
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

  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const normalizedBg = useUniformIcons && image ? bgColorImg(image) : undefined;

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setImage(evt.currentTarget);
  };

  const isBlobUrl = src.startsWith('blob:');

  return (
    <FoldsAvatarImage
      className={css.RoomAvatar}
      style={{ backgroundColor: useUniformIcons ? normalizedBg : undefined }}
      src={src}
      crossOrigin={isBlobUrl ? undefined : 'anonymous'}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        setImage(undefined);
        onError();
      }}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
