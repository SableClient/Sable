import { style } from '@vanilla-extract/css';
import { color } from 'folds';

export const SidebarResizer = style({
  width: '4px',
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
  backgroundColor: color.Primary.Main,
  transition: '0.2s',
});
