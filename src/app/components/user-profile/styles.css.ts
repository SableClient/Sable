import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const UserHeader = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1,
  padding: config.space.S200,
});

export const UserHero = style({
  position: 'relative',
});

export const UserHeroCoverContainer = style({
  height: toRem(96),
  overflow: 'hidden',
});

export const UserHeroCover = style({
  height: '100%',
  width: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
});

export const UserHeroCoverFallback = style({
  filter: 'blur(16px) brightness(50%)',
  transform: 'scale(2)',
});

export const UserHeroAvatarStatusContainer = style({
  position: 'relative',
  height: toRem(29),
  width: '100%',
});
export const UserHeroAvatarContainer = style({
  position: 'relative',
  paddingLeft: config.space.S400,
});
export const UserAvatarContainer = style({
  position: 'relative',
  top: 0,
  transform: 'translateY(-50%)',
  backgroundColor: color.Surface.Container,
});
export const UserHeroStatusContainer = style({
  position: 'relative',
  transform: 'translateY(-50%)',
  textAlign: 'justify',
  display: 'grid',
  width: '100%',
  paddingLeft: '2%',
});
export const UserHeroStatusTooltip = style({
  maxWidth: '98%',
  justifySelf: 'left',
});

export const UserHeroStatusTooltipInteractive = style({
  cursor: 'pointer',
  ':hover': {
    filter: 'brightness(var(--user-hero-status-hover-brightness, 0.94))',
    transform: 'translateY(-1px)',
  },
});
export const UserHeroAvatar = style({
  outline: `${config.borderWidth.B600} solid ${color.Surface.Container}`,
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
  },
});
export const UserHeroAvatarImg = style({
  selectors: {
    [`button${UserHeroAvatar}:hover &`]: {
      filter: 'brightness(0.5)',
    },
  },
});
export const UserHeroBrightnessHover = style({
  ':hover': {
    filter: 'brightness(var(--user-hero-chip-hover-brightness, 0.94))',
    transform: 'translateY(-1px)',
  },
});

export const UserHeroChip = style([
  UserHeroBrightnessHover,
  {
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
  },
]);

export const UserHeroChipThemed = style([
  UserHeroBrightnessHover,
  {
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: 'transparent',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
  },
]);

export const MiscDataToggleButton = style({
  backgroundColor: 'transparent',
  opacity: 0.75,
  selectors: {
    '&:hover': {
      opacity: 1,
      backgroundColor: 'transparent',
      transform: 'none !important',
    },
    '&:active': {
      transform: 'none !important',
    },
  },
});
/** Same hover lift/filter as UserHeroBrightnessHover; pins bg so folds MenuItem hover can't mask brightness. */
export const UserHeroMenuItem = style({
  borderStyle: 'hidden',
  borderWidth: '1px',
  selectors: {
    '&:hover': {
      filter: 'brightness(var(--user-hero-chip-hover-brightness, 0.94))',
      transform: 'translateY(-1px)',
      backgroundColor: 'var(--user-hero-menu-item-bg) !important',
    },
  },
});
