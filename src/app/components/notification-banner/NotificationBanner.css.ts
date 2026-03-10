import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

const slideIn = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(-100%)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

const slideOut = keyframes({
  from: {
    opacity: 1,
    transform: 'translateY(0)',
  },
  to: {
    opacity: 0,
    transform: 'translateY(-100%)',
  },
});

// Floats at the top of the viewport, spanning full width on all platforms.
export const BannerContainer = style({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  padding: config.space.S400,
  pointerEvents: 'none',
  alignItems: 'stretch',
});

export const Banner = style({
  position: 'relative',
  overflow: 'hidden',
  pointerEvents: 'all',
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(16),
  padding: `${config.space.S300} ${config.space.S400}`,
  boxShadow: `0 ${toRem(8)} ${toRem(32)} rgba(0, 0, 0, 0.45), 0 ${toRem(2)} ${toRem(8)} rgba(0, 0, 0, 0.3)`,
  cursor: 'pointer',
  width: '100%',
  animationName: slideIn,
  animationDuration: '260ms',
  animationTimingFunction: 'cubic-bezier(0.22, 0.8, 0.6, 1)',
  animationFillMode: 'both',

  selectors: {
    '&:hover': {
      backgroundColor: color.Surface.ContainerHover,
    },
    '&[data-dismissing=true]': {
      animationName: slideOut,
      animationDuration: '200ms',
      animationTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
      animationFillMode: 'both',
    },
  },
});

export const BannerIcon = style({
  width: toRem(44),
  height: toRem(44),
  objectFit: 'cover',
  borderRadius: config.radii.R300,
  flexShrink: 0,
});

export const BannerContent = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const BannerTitle = style({
  fontWeight: 700,
});

export const BannerSubtitle = style({
  fontWeight: 400,
  opacity: 0.7,
});

export const BannerRoomName = style({
  color: color.Primary.Main,
  fontWeight: 600,
});

// Caps tall previews and fades the bottom edge when content overflows.
// Desktop: 25vh, mobile (≤768px): 35vh.
export const BannerBody = style({
  position: 'relative',
  maxHeight: '25vh',
  overflow: 'hidden',

  '@media': {
    '(max-width: 768px)': {
      maxHeight: '35vh',
    },
  },

  selectors: {
    '&[data-overflow=true]::after': {
      content: '""',
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: toRem(28),
      background: `linear-gradient(to bottom, transparent, ${color.Surface.Container})`,
      pointerEvents: 'none',
    },
    '&[data-overflow=true][data-hovered=true]::after': {
      background: `linear-gradient(to bottom, transparent, ${color.Surface.ContainerHover})`,
    },
  },
});

export const ProgressBar = style({
  position: 'absolute',
  bottom: 0,
  left: 0,
  height: toRem(3),
  borderBottomLeftRadius: toRem(16),
  backgroundColor: color.Primary.Main,
  animationName: keyframes({
    from: { width: '100%' },
    to: { width: '0%' },
  }),
  animationTimingFunction: 'linear',
  animationFillMode: 'both',

  selectors: {
    '&[data-paused=true]': {
      animationPlayState: 'paused',
    },
  },
});
