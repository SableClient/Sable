import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const UserQuickTools = style({
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  zIndex: '1000',
  height: toRem(74),
  bottom: '0',
  padding: config.space.S0,
  borderTop: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
});
