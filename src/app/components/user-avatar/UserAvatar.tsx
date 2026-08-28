import { AvatarFallback, AvatarImage, color } from 'folds';
import type { ReactEventHandler, ReactNode } from 'react';
import classNames from 'classnames';
import colorMXID from '$utils/colorMXID';
import { useAvatarMediaSource } from '$hooks/useRenderableMediaUrl';
import * as css from './UserAvatar.css';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  fallbackColor?: string;
  renderFallback: () => ReactNode;
};

const handleImageLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
  evt.currentTarget.setAttribute('data-image-loaded', 'true');
};

export function UserAvatar({
  className,
  userId,
  src,
  alt,
  fallbackColor,
  renderFallback,
}: UserAvatarProps) {
  const { mediaSrc, error, onError } = useAvatarMediaSource(src);

  if (!mediaSrc || error) {
    return (
      <AvatarFallback
        style={{
          backgroundColor: fallbackColor ?? colorMXID(userId),
          color: color.Surface.Container,
        }}
        className={classNames(css.UserAvatar, className)}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage
      className={classNames(css.UserAvatar, className)}
      src={mediaSrc}
      alt={alt}
      loading="eager"
      decoding="async"
      onError={onError}
      onLoad={handleImageLoad}
      draggable={false}
    />
  );
}
