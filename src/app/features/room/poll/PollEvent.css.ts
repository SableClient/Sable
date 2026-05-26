import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const RadioZone = style({
  display: 'flex',
  alignItems: 'center',
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  selectors: {
    '&:disabled': {
      cursor: 'default',
    },
  },
});

export const AnswerTextButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  flexGrow: 1,
  minWidth: 0,
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: color.Surface.OnContainer,
});

export const AnswerTextRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  flexGrow: 1,
  minWidth: 0,
});
