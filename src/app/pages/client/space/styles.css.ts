import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const RoomCoverHeaderContainer = style({ width: '100%', position: 'relative' });
export const RoomCoverNavContainer = style({
  position: 'absolute',
  width: '100%',
  zIndex: '10000',
  top: '0',
  background: 'linear-gradient(0deg,#0000 0%, rgb(0, 0, 0) 120%)',
});
export const RoomCoverlessNavContainer = style({
  flexShrink: 0,
  padding: `${config.space.S100} ${config.space.S200} ${config.space.S200} ${config.space.S400}`,
  borderBottom: `1px solid ${color.Background.ContainerLine}`,
  minHeight: '100%',
  paddingRight: 0,
});

export const RoomCoverContainer = style({
  height: toRem(190),
  overflow: 'hidden',
});

export const RoomCover = style({
  height: '100%',
  width: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
});

export const RoomCoverFallback = style({
  filter: 'blur(16px) brightness(50%)',
  transform: 'scale(2)',
});

export const RoomCoverImage = style({
  objectFit: 'cover',
  width: '100%',
});
