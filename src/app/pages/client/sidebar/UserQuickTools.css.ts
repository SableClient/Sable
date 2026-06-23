import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const UserQuickTools = style({
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  position: 'fixed',
  zIndex: '1000',
  height: toRem(58),
  bottom: '0',
  left: '0',
  padding: config.space.S300,
  borderTop: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
});
