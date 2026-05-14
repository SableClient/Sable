import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

export const EventReaders = style([
  DefaultReset,
  {
    height: '100%',
    width: '280px',
  },
]);

export const Header = style({
  paddingLeft: config.space.S400,
  paddingRight: config.space.S300,

  flexShrink: 0,
});

export const Content = style({
  paddingLeft: config.space.S200,
  paddingBottom: config.space.S400,
  width: '100%',
  minWidth: 0,
});
