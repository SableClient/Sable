import { style } from '@vanilla-extract/css';
import { color } from 'folds';

/** Out-of-flow so flex siblings (e.g. PageRoot vertical Line) stay flush with the panel edge. */
export const SidebarResizerDockRight = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 2,
  cursor: 'col-resize',
});

export const SidebarResizerDockLeft = style({
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  zIndex: 2,
  cursor: 'col-resize',
});

export const SidebarResizerDockTop = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2,
  cursor: 'ns-resize',
});

export const SidebarResizer = style({
  backgroundColor: 'inherit',
  transition: '0.2s',
  ':hover': {},
});
export const SidebarResizerHover = style({
  zIndex: 100,
});
export const SideBarResizerAnimation = style({
  width: '100%',
  height: '100%',
  backgroundColor: color.Surface.ContainerLine,
  transition: '0.5s',
});
