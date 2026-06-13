import type { JoinRule } from '$types/matrix-sdk';
import { AvatarFallback, color } from 'folds';
import type { ReactNode } from 'react';
import { forwardRef, useEffect, useState } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import classNames from 'classnames';
import { sizedIcon, type IconSizeToken } from '$components/icons/phosphor';
import {
  getRoomIconComponent,
  getRoomIconOverlay,
  getRoomIconOverlayComponent,
  getRoomStandaloneIconComponent,
} from '$components/icons/roomIcons';
import colorMXID from '$utils/colorMXID';
import * as css from './RoomAvatar.css';
import { AvatarImage } from './AvatarImage';

type RoomAvatarProps = {
  roomId: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
  uniformIcons?: boolean;
};

export function RoomAvatar({ roomId, src, alt, renderFallback, uniformIcons }: RoomAvatarProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    return (
      <AvatarFallback
        style={{ backgroundColor: colorMXID(roomId ?? ''), color: color.Surface.Container }}
        className={css.RoomAvatar}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage src={src} alt={alt} uniformIcons={uniformIcons} onError={() => setError(true)} />
  );
}

export const RoomIcon = forwardRef<
  HTMLSpanElement,
  Omit<IconProps, 'ref'> & {
    joinRule?: JoinRule;
    roomType?: string;
    size?: IconSizeToken;
    filled?: boolean;
    withOverlay?: boolean;
  }
>(
  (
    { joinRule, roomType, size = '200', filled, withOverlay = true, className, style, ...props },
    ref
  ) => {
    const Icon = withOverlay
      ? getRoomIconComponent(roomType, joinRule)
      : getRoomStandaloneIconComponent(roomType, joinRule);
    const overlay = withOverlay ? getRoomIconOverlay(roomType, joinRule) : undefined;

    if (overlay) {
      const OverlayIcon = getRoomIconOverlayComponent(overlay);
      const overlayWeight = filled ? 'fill' : 'regular';
      return (
        <span ref={ref} className={classNames(css.RoomIconRoot, className)} style={style}>
          <span className={css.RoomIconComposite}>
            {sizedIcon(Icon, size, { ...props, filled })}
            <span
              className={classNames(css.RoomIconBadge, css.RoomIconBadgeShape[overlay])}
              aria-hidden
            >
              <span className={css.RoomIconBadgeIcon}>
                <OverlayIcon size="100%" weight={overlayWeight} color={props.color} />
              </span>
            </span>
          </span>
        </span>
      );
    }

    return (
      <span ref={ref} className={classNames(css.RoomIconRoot, className)} style={style}>
        {sizedIcon(Icon, size, { ...props, filled })}
      </span>
    );
  }
);
