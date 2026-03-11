import { style } from '@vanilla-extract/css';
import { config, color, toRem } from 'folds';

export const ThreadDrawer = style({
  width: toRem(440),
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const ThreadDrawerHeader = style({
  flexShrink: 0,
  padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
  borderBottomWidth: config.borderWidth.B300,
});

export const ThreadDrawerContent = style({
  position: 'relative',
  overflow: 'hidden',
  flexGrow: 1,
});

export const ThreadDrawerInput = style({
  flexShrink: 0,
  borderTopWidth: config.borderWidth.B300,
  borderTopStyle: 'solid',
  borderTopColor: color.Background.ContainerLine,
});

export const ThreadDrawerOverlay = style({
  position: 'absolute',
  inset: 0,
  zIndex: 10,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: color.Background.Container,
});

export const ThreadBrowserItem = style({
  width: '100%',
  padding: `${config.space.S200} ${config.space.S100}`,
  borderRadius: config.radii.R300,
  textAlign: 'left',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  color: 'inherit',
  ':hover': {
    backgroundColor: color.SurfaceVariant.Container,
  },
});
