import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const StatusRow = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `calc(${config.space.S200} + env(safe-area-inset-top, 0px)) ${config.space.S300} ${config.space.S100}`,
  textAlign: 'center',
});

export const DominantStage = style({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

export const DominantTile = style({
  flex: 1,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: color.Background.Container,
});

export const FloatingLocal = style({
  position: 'absolute',
  bottom: `calc(${config.space.S200} + env(safe-area-inset-bottom, 0px))`,
  right: `calc(${config.space.S200} + env(safe-area-inset-right, 0px))`,
  width: '120px',
  aspectRatio: '3 / 4',
  // TileSlot sizes itself as a flex child (`flex: 1`); without a flex parent it
  // collapses to the placeholder badge and the native video lands in a strip at
  // the top of the card instead of filling it.
  display: 'flex',
  zIndex: 3,
  borderRadius: config.radii.R400,
  overflow: 'hidden',
  border: `1px solid ${color.Surface.ContainerLine}`,
  background: color.Surface.Container,
});

export const TileGrid = style({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: 'grid',
  gap: config.space.S200,
  padding: config.space.S200,
  overflowY: 'auto',
  selectors: {
    '&[data-cols="2"]': {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridAutoRows: '1fr',
    },
    '&[data-cols="3"]': {
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridAutoRows: 'min-content',
    },
  },
});

export const Tile = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  borderRadius: config.radii.R400,
  background: color.Surface.Container,
  outline: `1px solid ${color.Surface.ContainerLine}`,
  outlineOffset: '-1px',
});

export const TileFixed = style({
  aspectRatio: '3 / 4',
  flexShrink: 0,
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
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  fontSize: toRem(22),
  fontWeight: 600,
  lineHeight: 1,
  userSelect: 'none',
});

export const TileLabel = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  padding: `${config.space.S100} ${config.space.S200}`,
  color: color.Surface.OnContainer,
  fontSize: toRem(13),
  lineHeight: toRem(18),
  borderTop: `1px solid ${color.Surface.ContainerLine}`,
});

export const TileLabelName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const QualityDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
  selectors: {
    '&[data-quality="good"]': { background: color.Success.Main },
    '&[data-quality="poor"]': { background: color.Warning.Main },
    '&[data-quality="lost"]': { background: color.Critical.Main },
    '&[data-quality="excellent"]': { background: color.Success.Main },
    // Neutral rather than a token: it reads as "no signal yet" against the dark
    // video stage, where a themed surface colour would look like a real state.
    '&[data-quality="unknown"]': { background: color.Surface.ContainerLine },
  },
});

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
      outline: `2px solid ${color.Primary.Main}`,
      outlineOffset: '2px',
    },
  },
});
