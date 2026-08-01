import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

/**
 * Shared call chrome styles: the canvas shell, the glassmorphic control
 * pill, and the on/off media toggle button. Both call surfaces (livekit-js and
 * native) render into these so the chrome reads consistently across engines
 * while each engine keeps its own video substrate and connection logic.
 */

/**
 * The full-height dark canvas. `position / width / height` stay inline on the
 * `CallLayout` component (the livekit-js surface asserts them via `toHaveStyle`
 * and the canvas already used inline styles), so this class carries only the
 * rest of the shell.
 */
export const callLayout = style({
  minHeight: 0,
  overflow: 'hidden',
  background: color.Background.Container,
});

/**
 * Floating control bar that overlays the video canvas (livekit-js). Drives the
 * auto-hide opacity/visibility transition; `opacity` / `visibility` are applied
 * inline by `CallControlBar` from its `visible` prop, and the pill re-enables
 * hit-testing, so the wrapper stays transparent to pointer events.
 */
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

/**
 * In-flow control bar that sits below the tile grid (native). The native video
 * overlay fully occludes anything beneath it, so controls live in normal flow
 * next to (never on top of) a video slot, and never auto-hide.
 */
export const controlBarFlow = style({
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: `${config.space.S100} ${config.space.S300} calc(${config.space.S300} + env(safe-area-inset-bottom, 0px))`,
});

/**
 * The glassmorphic pill that holds the control buttons. Shared by both control
 * bar layouts; only the wrapper (overlay vs flow) and hit-testing differ.
 */
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

/**
 * Round on/off toggle for mic and camera. `data-on` drives the on (neutral) vs
 * off (muted-red) affordance; identical to the native surface's previous button
 * so its behavior and look are unchanged.
 */
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
