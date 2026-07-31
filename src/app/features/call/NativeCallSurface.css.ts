import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

/**
 * Native-call-specific styles. The dark canvas shell, the control bar pill, and
 * the on/off media toggle are shared via `callChrome.css.ts`; what stays here is
 * the in-flow layout the native path needs because its video overlay fully
 * occludes anything beneath it: the transient status row, the tile grid, the
 * tile slots whose rects JS reports to the native side, and the end-call button.
 */

export const StatusRow = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `calc(${config.space.S200} + env(safe-area-inset-top, 0px)) ${config.space.S300} ${config.space.S100}`,
  textAlign: 'center',
});

/** Full-bleed stage for the featured remote participant (FaceTime-style). */
export const FeaturedStage = style({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

/** The featured remote tile — full-bleed, no rounding. */
export const FeaturedTile = style({
  flex: 1,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: '#090b10',
});

/** Small floating local preview card (bottom-right, above controls). */
export const FloatingLocal = style({
  position: 'absolute',
  bottom: `calc(${config.space.S200} + env(safe-area-inset-bottom, 0px))`,
  right: `calc(${config.space.S200} + env(safe-area-inset-right, 0px))`,
  width: '120px',
  aspectRatio: '3 / 4',
  zIndex: 3,
  borderRadius: config.radii.R400,
  overflow: 'hidden',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  background: '#14171f',
});

/** Horizontal filmstrip for non-featured remote participants. */
export const Filmstrip = style({
  display: 'flex',
  gap: config.space.S200,
  overflowX: 'auto',
  padding: `${config.space.S100} ${config.space.S200}`,
  flexShrink: 0,
});

export const FilmstripTile = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  width: '100px',
  height: '100px',
  flexShrink: 0,
  overflow: 'hidden',
  borderRadius: config.radii.R400,
  background: '#14171f',
  outline: '1px solid rgba(255, 255, 255, 0.06)',
  outlineOffset: '-1px',
});

/** Grid layout for audio-only (no featured video). */
export const TilesStage = style({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
  gridAutoRows: '1fr',
  gap: config.space.S200,
  padding: config.space.S200,
  overflowY: 'auto',
});

export const Tile = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  borderRadius: config.radii.R400,
  background: '#14171f',
  outline: '1px solid rgba(255, 255, 255, 0.06)',
  outlineOffset: '-1px',
});

// The rect this element occupies is what JS reports to the native side; keep
// it free of labels so the native video never covers them.
export const TileSlot = style({
  position: 'relative',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: config.space.S100,
});

export const InitialsBadge = style({
  display: 'grid',
  placeItems: 'center',
  width: 'min(72px, 45%)',
  aspectRatio: '1 / 1',
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.10)',
  color: 'rgba(255, 255, 255, 0.92)',
  fontSize: toRem(22),
  fontWeight: 600,
  lineHeight: 1,
  userSelect: 'none',
});

export const SlotCaption = style({
  color: 'rgba(255, 255, 255, 0.55)',
  textAlign: 'center',
  padding: `0 ${config.space.S200}`,
});

export const TileLabel = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  padding: `${config.space.S100} ${config.space.S200}`,
  color: 'rgba(255, 255, 255, 0.9)',
  fontSize: toRem(13),
  lineHeight: toRem(18),
  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
});

export const TileLabelName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

/** Connection quality indicator dot. */
export const QualityDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
  selectors: {
    '&[data-quality="good"]': { background: '#4ade80' },
    '&[data-quality="poor"]': { background: '#fbbf24' },
    '&[data-quality="lost"]': { background: '#ef4444' },
    '&[data-quality="excellent"]': { background: '#4ade80' },
    '&[data-quality="unknown"]': { background: 'rgba(255,255,255,0.3)' },
  },
});

/** Round red disconnect button (icon-only, LiveKit mobile idiom). */
export const HangupButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(44),
  height: toRem(44),
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: '#f54336',
  color: '#ffffff',
  cursor: 'pointer',
  transition: 'filter 120ms ease',
  selectors: {
    '&:hover': {
      filter: 'brightness(1.12)',
    },
    '&:focus-visible': {
      outline: `2px solid var(--sable-primary-main, #7aa2ff)`,
      outlineOffset: '2px',
    },
  },
});
