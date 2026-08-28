import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

const mono = { fontFamily: 'var(--font-monospace)' };

export const DiffCodeBlock = style([
  mono,
  {
    margin: 0,
    color: color.SurfaceVariant.OnContainer,
    background: color.SurfaceVariant.Container,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R300,
    padding: `${config.space.S100} ${config.space.S200}`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    overflow: 'hidden',
    fontSize: '1rem !important',
    lineHeight: 'inherit',
  },
]);

export const DiffCodeBlockInner = style({
  display: 'block',
  margin: 0,
  padding: 0,
});

export const DiffLine = style([
  mono,
  {
    display: 'flex',
    gap: config.space.S200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
]);

export const DiffLinePrefix = style({
  flexShrink: 0,
  width: '1ch',
  opacity: config.opacity.P500,
  userSelect: 'none',
});

export const DiffLineText = style({
  flexGrow: 1,
  minWidth: 0,
});

export const DiffLineEqual = style({});

export const DiffLineDelete = style({
  backgroundColor: color.Critical.Container,
  color: color.Critical.OnContainer,
});

export const DiffLineInsert = style({
  backgroundColor: color.Success.Container,
  color: color.Success.OnContainer,
});

export const DiffExpand = style([
  mono,
  {
    display: 'flex',
    gap: config.space.S200,
    alignItems: 'center',
    width: '100%',
    margin: 0,
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    opacity: config.opacity.P500,
    fontSize: 'inherit',
    lineHeight: 'inherit',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    selectors: {
      '&:hover': {
        opacity: 1,
        backgroundColor: color.SurfaceVariant.ContainerActive,
      },
    },
  },
]);

export const DiffInlineDelete = style({
  backgroundColor: color.Critical.Container,
  color: color.Critical.OnContainer,
  textDecoration: 'line-through',
  borderRadius: config.radii.R300,
});

export const DiffInlineInsert = style({
  backgroundColor: color.Success.Container,
  color: color.Success.OnContainer,
  borderRadius: config.radii.R300,
});
