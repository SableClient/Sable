import { globalStyle, style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

/**
 * Scoped base styles for the @livekit/components-react primitives used by
 * LivekitJsCallSurface. The components-styles package is intentionally not a
 * dependency, so only the primitives we render are covered here.
 */
export const CallSurface = style({});

const surface = CallSurface;

globalStyle(`${surface} .lk-participant-tile`, {
  position: 'relative',
  flexShrink: 0,
  background: '#14171f',
  borderRadius: config.radii.R400,
  overflow: 'hidden',
});

globalStyle(`${surface} .lk-participant-tile > video`, {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

globalStyle(`${surface} .lk-participant-tile[data-lk-source='screen_share'] > video`, {
  objectFit: 'contain',
  background: '#07080c',
});

globalStyle(`${surface} .lk-participant-tile[data-lk-video-muted='true'] > video`, {
  visibility: 'hidden',
});

globalStyle(
  `${surface} .lk-participant-tile[data-lk-local-participant='true'][data-lk-facing-mode='user'] > video`,
  {
    transform: 'scaleX(-1)',
  }
);

globalStyle(`${surface} .lk-participant-tile[data-lk-speaking='true']`, {
  boxShadow: 'inset 0 0 0 2px var(--sable-primary-main, #7aa2ff)',
});

globalStyle(`${surface} .lk-participant-placeholder`, {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: '#14171f',
});

globalStyle(`${surface} .lk-participant-placeholder > svg`, {
  width: 'min(96px, 35%)',
  height: 'auto',
});

globalStyle(`${surface} .lk-participant-metadata`, {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  padding: `${config.space.S300} ${config.space.S200} ${config.space.S100}`,
  background: 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.55))',
  color: '#ffffff',
  fontSize: toRem(13),
  lineHeight: toRem(16),
  pointerEvents: 'none',
});

globalStyle(`${surface} .lk-participant-metadata .lk-participant-metadata-item`, {
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  minWidth: 0,
});

globalStyle(`${surface} .lk-participant-metadata .lk-participant-name`, {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

globalStyle(`${surface} .lk-participant-metadata svg`, {
  width: toRem(16),
  height: toRem(16),
  flexShrink: 0,
});

globalStyle(`${surface} .lk-grid-layout`, {
  position: 'relative',
});

globalStyle(`${surface} .lk-carousel`, {
  width: 'clamp(140px, 22%, 260px)',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'thin',
  '@media': {
    '(max-width: 560px)': {
      width: toRem(104),
    },
  },
});

globalStyle(`${surface} .lk-carousel .lk-participant-tile`, {
  width: '100%',
  aspectRatio: '16 / 10',
});

globalStyle(`${surface} .lk-pagination-control`, {
  position: 'absolute',
  right: config.space.S300,
  bottom: config.space.S300,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  padding: config.space.S100,
  borderRadius: config.radii.R400,
  background: 'rgba(9, 11, 16, 0.72)',
  color: '#ffffff',
});

globalStyle(`${surface} .lk-pagination-indicator`, {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: config.space.S200,
  display: 'flex',
  justifyContent: 'center',
  gap: config.space.S100,
});

globalStyle(`${surface} .lk-pagination-indicator > span`, {
  width: toRem(8),
  height: toRem(8),
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.4)',
});

globalStyle(`${surface} .lk-pagination-indicator > span[data-lk-active='true']`, {
  background: '#ffffff',
});

globalStyle(`${surface} .lk-control-bar`, {
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  maxWidth: '100%',
});

globalStyle(`${surface} .lk-button`, {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: config.space.S100,
  minWidth: toRem(44),
  minHeight: toRem(44),
  padding: `0 ${config.space.S200}`,
  border: 'none',
  borderRadius: config.radii.R400,
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#ffffff',
  font: 'inherit',
  cursor: 'pointer',
  transition: 'background-color 120ms ease',
});

globalStyle(`${surface} .lk-button:hover:not(:disabled)`, {
  background: 'rgba(255, 255, 255, 0.16)',
});

globalStyle(`${surface} .lk-button:focus-visible`, {
  outline: `2px solid var(--sable-primary-main, #7aa2ff)`,
  outlineOffset: 2,
});

globalStyle(`${surface} .lk-button[aria-pressed='false']`, {
  background: 'rgba(204, 74, 74, 0.45)',
});

globalStyle(`${surface} .lk-button:disabled`, {
  opacity: 0.45,
  cursor: 'default',
});

globalStyle(`${surface} .lk-button svg`, {
  width: toRem(20),
  height: toRem(20),
});

globalStyle(`${surface} .lk-button-group`, {
  position: 'relative',
  display: 'inline-flex',
});

globalStyle(`${surface} .lk-button-group > .lk-button`, {
  borderRadius: `${config.radii.R400} 0 0 ${config.radii.R400}`,
});

globalStyle(`${surface} .lk-button-group-menu > .lk-button`, {
  minWidth: toRem(28),
  padding: `0 ${config.space.S100}`,
  borderRadius: `0 ${config.radii.R400} ${config.radii.R400} 0`,
  background: 'rgba(255, 255, 255, 0.05)',
});

globalStyle(`${surface} .lk-button-group-menu > .lk-button:hover:not(:disabled)`, {
  background: 'rgba(255, 255, 255, 0.16)',
});

globalStyle(`${surface} .lk-device-menu`, {
  position: 'absolute',
  zIndex: 6,
  minWidth: toRem(220),
  padding: config.space.S100,
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: config.radii.R400,
  background: '#171a22',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
  color: '#ffffff',
});

globalStyle(`${surface} .lk-device-menu > ul`, {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  maxHeight: toRem(240),
  overflowY: 'auto',
});

globalStyle(`${surface} .lk-device-menu-heading`, {
  padding: `${config.space.S100} ${config.space.S200}`,
  fontSize: toRem(12),
  opacity: 0.6,
});

globalStyle(`${surface} .lk-device-menu .lk-button`, {
  width: '100%',
  justifyContent: 'flex-start',
  minHeight: toRem(36),
  background: 'transparent',
});

globalStyle(`${surface} .lk-device-menu li[data-lk-active='true'] > .lk-button`, {
  color: 'var(--sable-primary-main, #7aa2ff)',
});

export const AudioParticipant = style({
  gap: config.space.S200,
  padding: config.space.S200,
  borderRadius: config.radii.R400,
  border: '2px solid transparent',
  transition: 'border-color 120ms ease',
  selectors: {
    '&[data-lk-speaking="true"]': {
      borderColor: 'var(--sable-primary-main, #7aa2ff)',
    },
  },
});
