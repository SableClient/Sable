import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

export const SidebarResizer = style({
  width: toRem(4),
  backgroundColor: 'inherit',
  transition: '0.2s',
  ':hover': {},
});
export const SidebarResizerHover = style({
  height: '100%',
  zIndex: '100',
});
export const SideBarResizerAnimation = style({
  width: '100%',
  height: '100%',
  backgroundColor: color.Surface.ContainerLine,
  transition: '0.5s',
});
