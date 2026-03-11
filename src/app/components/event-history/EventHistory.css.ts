import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const EventHistory = style([
  DefaultReset,
  {
    height: '100%',
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
});
export const EventItem = style({
  padding: `${config.space.S200} ${config.space.S200}`,
  height: 'unset',
  width: '100%',
  borderRadius: '5px',
  border: '2px hidden',
  backgroundColor: 'inherit',
  selectors: {
    '&:hover': {
      backgroundColor: color.Surface.ContainerHover,
    },
  },
});
export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'absolute',
    top: toRem(-30),
    right: 0,
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);
export const MenuOptions = style({
  position: 'absolute',
  right: '0',
  top: '0',
  display: 'flex',
  transform: 'translateY(-75%)',
});
