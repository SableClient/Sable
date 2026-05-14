import { style } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { color, config } from 'folds';

export const RoomCoverHeaderContainer = style({ width: '100%', position: 'relative' });
export const RoomCoverNavContainer = style({
  position: 'absolute',
  width: '100%',
  zIndex: '10000',
  top: '0',
  background: `linear-gradient(180deg, #000 0%, #0000 100%)`,
});
export const RoomCoverlessNavContainer = recipe({
  base: {
    flexShrink: 0,
    borderBottom: `1px solid ${color.Background.ContainerLine}`,
    minHeight: '100%',
    paddingRight: 0,
  },
  variants: {
    hideText: {
      true: {
        padding: `${config.space.S100} ${config.space.S200} ${config.space.S200}`,
      },
      false: {
        padding: `${config.space.S100} ${config.space.S200} ${config.space.S200} ${config.space.S400}`,
      },
    },
  },
});

export const RoomCoverContainer = style({
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
