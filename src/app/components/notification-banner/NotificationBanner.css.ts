import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { OVERLAY_LAYER_TOP } from '$components/overlay-stack/layers';

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

const fadeOut = keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
});

const slideOut = keyframes({
  from: {
    transform: 'translateY(0)',
  },
  to: {
    transform: 'translateY(-100%)',
  },
});

const swipeOutLeft = keyframes({
  from: {
    transform: 'translateX(0)',
  },
  to: {
    transform: 'translateX(-100%)',
  },
});

const swipeOutRight = keyframes({
  from: {
    transform: 'translateX(0)',
  },
  to: {
    transform: 'translateX(100%)',
  },
});

// Positions at the top of the viewport, spanning full width.
// Uses fixed positioning with safe-area-inset to handle iOS keyboard correctly.
// On iOS, the banner stays at the top of the visual viewport even when keyboard is open.
// On Android (Tauri) the insets are injected via JS from Kotlin; the
// env() fallback handles the window between page load and injection.
export const BannerContainer = style({
  position: 'fixed',
  // Use safe-area-inset-top to position right below device-specific safe areas (notches, etc)
  top: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
  left: 0,
  right: 0,
  zIndex: OVERLAY_LAYER_TOP,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  padding: config.space.S400,
  pointerEvents: 'none',
  alignItems: 'flex-end',

  // On iOS, when keyboard opens, ensure banner stays visible at top of visual viewport
  '@supports': {
    '(-webkit-touch-callout: none)': {
      // iOS-specific: Position relative to the visible viewport when keyboard is open
      position: 'fixed',
      // Support both old and new safe area syntax
      top: 'max(var(--safe-area-inset-top, 0px), env(safe-area-inset-top, 0px), constant(safe-area-inset-top, 0px))',
    },
  },
});

export const BannerWrapper = style({
  pointerEvents: 'all',
  cursor: 'pointer',
  width: '100%',
  maxWidth: toRem(420),
  animationName: slideIn,
  animationDuration: '260ms',
  animationTimingFunction: 'cubic-bezier(0.22, 0.8, 0.6, 1)',
  animationFillMode: 'backwards',
  transitionProperty: 'transform',
  transitionDuration: '200ms',
  transitionTimingFunction: 'ease-out',

  selectors: {
    '&[data-dismissing=up], &[data-dismissing=left], &[data-dismissing=right]': {
      animationDuration: '200ms',
      animationTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
      animationFillMode: 'forwards',
      animationComposition: 'accumulate, replace',
    },
    '&[data-dismissing=up]': {
      animationName: `${slideOut}, ${fadeOut}`,
    },
    '&[data-dismissing=left]': {
      animationName: `${swipeOutLeft}, ${fadeOut}`,
    },
    '&[data-dismissing=right]': {
      animationName: `${swipeOutRight}, ${fadeOut}`,
    },
    '&[data-swiping=true]': {
      transitionProperty: 'none',
    },
  },
});

export const Banner = style({
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(16),
  padding: `${config.space.S300} ${config.space.S400}`,
  boxShadow: `0 ${toRem(8)} ${toRem(32)} rgba(0, 0, 0, 0.45), 0 ${toRem(2)} ${toRem(8)} rgba(0, 0, 0, 0.3)`,

  selectors: {
    ':hover > &': {
      backgroundColor: color.Surface.ContainerHover,
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

// Caps tall previews and fades the bottom edge when content overflows.
// Desktop: 25vh, mobile (≤768px): 35vh.
export const BannerBody = style({
  position: 'relative',
  maxHeight: '25dvh',
  overflow: 'hidden',

  '@media': {
    '(max-width: 768px)': {
      maxHeight: '35dvh',
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
