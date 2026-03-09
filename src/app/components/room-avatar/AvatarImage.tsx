import { AvatarImage as FoldsAvatarImage } from 'folds';
import { ReactEventHandler, useState } from 'react';
import bgColorImg from '$utils/bgColorImg';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useMediaSrc } from '$hooks/useMediaSrc';
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
  const normalizedBg = image ? bgColorImg(image) : undefined;
  const useUniformIcons = uniformIconsSetting && uniformIcons === true;
  const resolvedSrc = useMediaSrc(src);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
    setImage(evt.currentTarget);
  };

  return (
    <FoldsAvatarImage
      className={css.RoomAvatar}
      style={{ backgroundColor: useUniformIcons ? normalizedBg : undefined }}
      src={resolvedSrc ?? src}
      crossOrigin="anonymous"
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
