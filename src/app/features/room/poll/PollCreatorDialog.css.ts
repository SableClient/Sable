import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const DialogContent = style({
  padding: config.space.S400,
  minWidth: toRem(340),
  maxWidth: toRem(500),
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  maxHeight: `min(80vh, ${toRem(600)})`,
  overflowY: 'auto',
});

export const AnswerRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
});

export const AnswerInput = style({
  flex: 1,
});

export const KindSelector = style({
  display: 'flex',
  gap: config.space.S200,
});

export const ExpirySelector = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S100,
});

export const DatetimeInput = style({
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  background: color.SurfaceVariant.Container,
  color: 'inherit',
  fontSize: config.fontSize.T300,
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: color.Primary.Main,
    },
  },
});
