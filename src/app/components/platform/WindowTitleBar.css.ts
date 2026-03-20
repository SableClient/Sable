import { style } from '@vanilla-extract/css';
import { color } from 'folds';

export const TitleBar = style({
  height: '32px',
  width: '100%',
  position: 'fixed',
  top: 0,
  left: 0,
  zIndex: 9999,
  backgroundColor: color.Background.Container,
  userSelect: 'none',
  WebkitAppRegion: 'drag',
} as any);

export const TitleBarDragRegion = style({
  height: '100%',
  display: 'flex',
  paddingLeft: '12px',
});

export const TitleBarTitle = style({
  opacity: 0.7,
  pointerEvents: 'none',
});

export const TitleBarButton = style({
  WebkitAppRegion: 'no-drag',
  width: '46px',
  height: '32px',
  ':hover': {
    backgroundColor: color.SurfaceVariant.Container,
  },
} as any);

export const TitleBarCloseButton = style({
  WebkitAppRegion: 'no-drag',
  width: '46px',
  height: '32px',
  ':hover': {
    backgroundColor: color.Critical.Container,
    color: color.Critical.OnContainer,
  },
} as any);
