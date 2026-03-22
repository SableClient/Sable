import { forwardRef, ReactNode, useState } from 'react';
import { AvatarFallback, color } from 'folds';
import { JoinRule } from '$types/matrix-sdk';
import { PhosphorIcon, type PhosphorIconProps } from '$components/PhosphorIcon';
import { getRoomIcon } from '$utils/room';
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
  SVGSVGElement,
  Omit<PhosphorIconProps, 'as'> & {
    joinRule?: JoinRule;
    roomType?: string;
  }
>(({ joinRule, roomType, ...props }, ref) => (
  <PhosphorIcon as={getRoomIcon(roomType, joinRule)} {...props} ref={ref} />
));
