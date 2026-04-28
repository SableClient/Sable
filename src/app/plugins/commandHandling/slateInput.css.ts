import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const CommandInline = style({
  display: 'inline-flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: config.space.S100,
});

export const CommandAttribute = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
});

export const CommandAttributeLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(20),
  paddingLeft: toRem(10),
  opacity: config.opacity.Placeholder,
  fontWeight: config.fontWeight.W500,
});

globalStyle(`${CommandAttribute} input`, {
  minWidth: toRem(80),
  height: toRem(24),
  padding: `0 ${config.space.S100}`,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  fontSize: toRem(13),
});

globalStyle(`${CommandAttribute} input::placeholder`, {
  color: color.SurfaceVariant.OnContainer,
  opacity: config.opacity.Placeholder,
});

globalStyle(`${CommandAttribute} select`, {
  height: toRem(24),
  padding: `0 ${config.space.S100}`,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  fontSize: toRem(13),
  cursor: 'pointer',
});

globalStyle(`${CommandAttribute} input:focus`, {
  outline: 'none',
  boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.OnContainer}`,
});

globalStyle(`${CommandAttribute} select:focus`, {
  outline: 'none',
  boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.OnContainer}`,
});
