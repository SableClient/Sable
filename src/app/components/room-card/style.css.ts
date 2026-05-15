import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';
import { ContainerColor } from '$styles/ContainerColor.css';
import { recipe } from '@vanilla-extract/recipes';

export const CardGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: config.space.S400,
});

export const RoomCardBase = style([
  DefaultReset,
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    borderRadius: config.radii.R500,
    overflow: 'hidden',
  },
]);

export const RoomCardItems = style({
  padding: config.space.S500,
  backgroundColor: color.SurfaceVariant.Container,
});
export const RoomCardTopic = style({
  minHeight: `calc(3 * ${config.lineHeight.T200})`,
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  cursor: 'pointer',

  ':hover': {
    textDecoration: 'underline',
  },
});

export const ActionButton = style({
  flex: '1 1 0',
  minWidth: 1,
});

export const RoomCardBanner = recipe({
  base: {
    height: toRem(96),
    minHeight: toRem(96),
    width: '100%',
    objectFit: 'cover',
    objectPosition: 'center center',
  },
  variants: {
    trueBanner: {
      true: {},
      false: {
        filter: 'blur(40px)',
      },
    },
  },
});
export const RoomCardAvatar = style({
  position: 'sticky',
  transform: 'translateY(-50%)',
  marginLeft: config.space.S500,
  outline: `${config.borderWidth.B600} solid ${color.Surface.Container}`,
});
