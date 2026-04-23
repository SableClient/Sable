import { AvatarFallback, AvatarImage, color } from 'folds';
import type { ReactEventHandler, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import classNames from 'classnames';
import colorMXID from '$utils/colorMXID';
import * as css from './UserAvatar.css';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
};

const handleImageLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
  evt.currentTarget.setAttribute('data-image-loaded', 'true');
};

export function UserAvatar({ className, userId, src, alt, renderFallback }: UserAvatarProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    return (
      <AvatarFallback
        style={{ backgroundColor: colorMXID(userId), color: color.Surface.Container }}
        className={classNames(css.UserAvatar, className)}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage
      className={classNames(css.UserAvatar, className)}
      src={src}
      alt={alt}
      onError={() => setError(true)}
      onLoad={handleImageLoad}
      draggable={false}
    />
  );
}
