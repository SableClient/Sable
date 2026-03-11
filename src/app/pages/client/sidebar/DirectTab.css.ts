import { style } from '@vanilla-extract/css';

export const DMStackContainer = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr 1fr',
  gap: 2,
  width: '100%',
  height: '100%',
});

export const DMStackSingle = style({
  gridColumn: '1 / -1',
  gridRow: '1 / -1',
});

export const DMStackDouble = style({
  selectors: {
    '&:first-child': {
      gridColumn: '1 / -1',
      gridRow: '1',
    },
    '&:last-child': {
      gridColumn: '1 / -1',
      gridRow: '2',
    },
  },
});

export const DMStackTriple = style({
  selectors: {
    '&:first-child': {
      gridColumn: '1 / -1',
      gridRow: '1',
    },
    '&:nth-child(2)': {
      gridColumn: '1',
      gridRow: '2',
    },
    '&:last-child': {
      gridColumn: '2',
      gridRow: '2',
    },
  },
});

export const DMAvatar = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  fontSize: '10px',
});
