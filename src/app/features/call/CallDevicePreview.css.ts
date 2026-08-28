import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const PreviewSurface = style({
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: config.radii.R400,
  background: '#14171f',
  color: color.Surface.OnContainer,
  overflow: 'hidden',
});

export const PreviewVideo = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  // Front cameras read as a mirror to the person looking at them.
  transform: 'scaleX(-1)',
});

export const DeviceSelect = style({
  width: '100%',
  minWidth: 0,
  minHeight: toRem(36),
  padding: `0 ${config.space.S200}`,
  borderRadius: config.radii.R400,
  border: `1px solid ${color.Surface.ContainerLine}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  font: 'inherit',
  fontSize: toRem(14),
});

export const LevelTrack = style({
  width: '100%',
  height: toRem(6),
  borderRadius: config.radii.R400,
  background: color.Surface.ContainerLine,
  overflow: 'hidden',
});

export const LevelFill = style({
  width: '100%',
  height: '100%',
  transformOrigin: 'left center',
  background: color.Success.Main,
  transition: 'transform 80ms linear',
});
