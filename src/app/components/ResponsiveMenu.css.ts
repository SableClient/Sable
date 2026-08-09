import { globalStyle, style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const DialogContent = style({
  width: `min(90vw, ${toRem(400)})`,
  maxHeight: '85dvh',
  display: 'flex',
  flexDirection: 'column',
});

// Same reach-by-selector trick as the sheet: neutralise the inline sizing the
// callers set for their desktop popout so the menu fills the dialog.
globalStyle(`${DialogContent} > *:last-child`, {
  width: '100% !important',
  maxWidth: 'none !important',
  maxHeight: '100% !important',
  display: 'flex',
  flexDirection: 'column',
});

export const SheetContent = style({
  width: '100%',
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
});

// Targets the caller's menu element, which may be any component. Reaching it by
// selector rather than cloneElement keeps it working when the caller does not
// forward className. The sheet panel draws the background, radius and shadow, so
// the menu inside it must draw none of its own or its border shows up under the
// drag handle.
globalStyle(`${SheetContent} > *:last-child`, {
  // !important beats the inline maxWidth/width the callers set for their desktop popout.
  // Do not override maxHeight: callers use it to give nested Scroll elements a
  // definite scrollport.
  width: '100% !important',
  maxWidth: 'none !important',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  border: 'none !important',
  borderRadius: '0 !important',
  background: 'transparent !important',
  boxShadow: 'none !important',
  paddingTop: '0 !important',
  paddingBottom: `${config.space.S400} !important`,
});

// Desktop menus often constrain direct content groups instead of the menu itself.
// Let those groups stretch with the mobile sheet while preserving their desktop width.
globalStyle(`${SheetContent} > *:last-child > *`, {
  maxWidth: 'none !important',
});
