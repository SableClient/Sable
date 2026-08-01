import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const callLayout = style({
  minHeight: 0,
  overflow: 'hidden',
  background: color.Background.Container,
});

export const controlBarOverlay = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 4,
  display: 'flex',
  justifyContent: 'center',
  padding: `${config.space.S200} ${config.space.S300} calc(${config.space.S300} + env(safe-area-inset-bottom, 0px))`,
  transition: 'opacity 160ms ease, visibility 160ms ease',
  pointerEvents: 'none',
});

export const controlBarFlow = style({
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: `${config.space.S100} ${config.space.S300} calc(${config.space.S300} + env(safe-area-inset-bottom, 0px))`,
});

export const controlPill = style({
  display: 'flex',
  alignItems: 'center',
  // Wraps rather than overflowing: the parent clips, so an unwrapped row loses
  // the End call button off the edge on a narrow viewport.
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: config.space.S200,
  maxWidth: '100%',
  padding: config.space.S100,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: config.radii.R500,
  background: color.Surface.Container,
  backdropFilter: 'blur(12px)',
});

export const controlButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: toRem(44),
  minHeight: toRem(44),
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  font: 'inherit',
  cursor: 'pointer',
  transition: 'background-color 120ms ease',
  selectors: {
    '&[data-on="true"]': {
      background: color.SurfaceVariant.Container,
      color: color.SurfaceVariant.OnContainer,
    },
    '&[data-on="true"]:hover:not(:disabled)': {
      background: color.SurfaceVariant.ContainerHover,
    },
    '&[data-on="false"]': {
      background: color.Critical.Container,
      color: color.Critical.OnContainer,
    },
    '&[data-on="false"]:hover:not(:disabled)': {
      background: color.Critical.ContainerHover,
    },
    '&:focus-visible': {
      outline: `2px solid var(--sable-primary-main, #7aa2ff)`,
      outlineOffset: '2px',
    },
    '&:disabled': {
      opacity: 0.45,
      cursor: 'default',
    },
  },
});
