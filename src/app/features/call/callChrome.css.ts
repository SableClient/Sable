import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

/**
 * Shared call chrome styles — the dark canvas shell, the glassmorphic control
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
  background: 'var(--sable-livekit-canvas, #090b10)',
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
 * next to — never on top of — a video slot, and never auto-hide.
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
  gap: config.space.S200,
  maxWidth: '100%',
  padding: config.space.S100,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: config.radii.R500,
  background: 'rgba(9, 11, 16, 0.72)',
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
      background: 'rgba(255, 255, 255, 0.14)',
      color: '#ffffff',
    },
    '&[data-on="true"]:hover:not(:disabled)': {
      background: 'rgba(255, 255, 255, 0.22)',
    },
    '&[data-on="false"]': {
      background: 'rgba(204, 74, 74, 0.55)',
      color: '#ffffff',
    },
    '&[data-on="false"]:hover:not(:disabled)': {
      background: 'rgba(204, 74, 74, 0.7)',
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
