import { style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, RadiiVariant, color, config, toRem } from 'folds';

export const UploadCard = recipe({
  base: {
    padding: config.space.S300,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderColor: color.SurfaceVariant.ContainerLine,
  },
  variants: {
    radii: RadiiVariant,
    outlined: {
      true: {
        borderStyle: 'solid',
        borderWidth: config.borderWidth.B300,
      },
    },
    compact: {
      true: {
        padding: config.space.S100,
      },
    },
  },
  defaultVariants: {
    radii: '400',
  },
});

export type UploadCardVariant = RecipeVariants<typeof UploadCard>;

export const UploadCardError = style({
  padding: `0 ${config.space.S100}`,
  color: color.Critical.Main,
});

export const AudioPreviewContainer = style([
  DefaultReset,
  {
    backgroundColor: color.SurfaceVariant.Container,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R400,
    padding: config.space.S300,
    width: '100%',
    maxWidth: toRem(400),
    boxSizing: 'border-box',
  },
]);

export const AudioWaveformContainer = style([
  DefaultReset,
  {
    minHeight: 44,
    cursor: 'pointer',
    userSelect: 'none',
    overflow: 'hidden',
  },
]);

export const AudioWaveformBar = style([
  DefaultReset,
  {
    width: 2,
    height: 3,
    borderRadius: 1,
    flexShrink: 0,
    transition: 'background-color 40ms, opacity 40ms',
    pointerEvents: 'none',
  },
]);

export const AudioWaveformBarPlayed = style([
  DefaultReset,
  {
    backgroundColor: color.Secondary.Main,
    opacity: 1,
  },
]);

export const AudioWaveformBarUnplayed = style([
  DefaultReset,
  {
    backgroundColor: color.SurfaceVariant.OnContainer,
    opacity: 0.5,
  },
]);

export const AudioTimeDisplay = style([
  DefaultReset,
  {
    fontVariantNumeric: 'tabular-nums',
    color: color.SurfaceVariant.OnContainer,
    minWidth: toRem(30),
    textAlign: 'right',
    flexShrink: 0,
  },
]);
