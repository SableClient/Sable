import { style } from '@vanilla-extract/css';
import { config } from 'folds';

// Vote button wrapping just the radio circle - minimal touch target
export const RadioZone = style({
  all: 'unset',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  padding: `${config.space.S100} 0`,
  selectors: {
    '&:disabled': {
      cursor: 'default',
    },
  },
});

// Text + percent area - clickable to reveal voters
export const AnswerTextButton = style({
  all: 'unset',
  cursor: 'pointer',
  display: 'flex',
  flex: 1,
  alignItems: 'center',
  gap: config.space.S200,
  minWidth: 0,
  padding: `${config.space.S100} 0`,
});

// Non-interactive version of the text area
export const AnswerTextRow = style({
  display: 'flex',
  flex: 1,
  alignItems: 'center',
  gap: config.space.S200,
  minWidth: 0,
  padding: `${config.space.S100} 0`,
});
