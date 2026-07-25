import { globalStyle, style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const SheetContent = style({
  width: '100%',
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
});

// Targets the caller's menu element, which may be any component. Reaching it by
// selector rather than cloneElement keeps it working when the caller does not
// forward className.
globalStyle(`${SheetContent} > *:last-child`, {
  // !important beats the inline maxWidth/width the callers set for their desktop popout.
  width: '100% !important',
  maxWidth: 'none !important',
  maxHeight: '100%',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  borderBottomLeftRadius: '0 !important',
  borderBottomRightRadius: '0 !important',
  borderBottom: 'none !important',
  borderTopLeftRadius: `${toRem(20)} !important`,
  borderTopRightRadius: `${toRem(20)} !important`,
  paddingBottom: `calc(${config.space.S400} + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) !important`,
});

globalStyle(`${SheetContent} > *:last-child::after`, {
  content: '""',
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  height: '300px',
  backgroundColor: 'inherit',
  border: 'none',
});
