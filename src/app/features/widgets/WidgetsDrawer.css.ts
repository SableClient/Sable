import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const WidgetsDrawer = style({
  maxWidth: '100vw',
  minWidth: '9vw',
});

export const WidgetsDrawerHeader = style({
  flexShrink: 0,
  padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
  borderBottomWidth: config.borderWidth.B300,
});

export const WidgetIframeContainer = style({
  flexGrow: 1,
  position: 'relative',
  overflow: 'hidden',
  minHeight: 0,
});

export const AddWidgetForm = style({
  padding: config.space.S300,
});

export const AddWidgetInput = style({
  width: '100%',
});
