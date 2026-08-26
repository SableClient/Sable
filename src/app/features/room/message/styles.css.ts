import { style } from '@vanilla-extract/css';
import { DefaultReset, FocusOutline, color, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
  maxWidth: '100%',
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});



export const MessageForceHover = style({
  backgroundColor: `${color.Surface.ContainerHover} !important`,
});

export const MessageSwipeReply = style({
  backgroundColor: color.Surface.ContainerHover,
});

export const MessageSwipeEdit = style({
  backgroundColor: color.Primary.Container,
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'fixed',
    top: toRem(-30),
    right: 0,
    zIndex: 1000,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

export const MessageOptionsWrappedMessage = style({
  padding: config.space.S200,
  width: '100%',
  maxHeight: '25%',
  overflow: 'auto',
});

const messageOptionsMenuLayout = {
  width: '100%',
  maxHeight: '100%',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
} as const;

// Inside the sheet panel, which owns the background, radius, shadow and safe area.
export const MessageOptionsSheetMenu = style({
  ...messageOptionsMenuLayout,
  border: 'none !important',
  borderRadius: '0 !important',
  background: 'transparent !important',
  boxShadow: 'none !important',
  paddingTop: '0 !important',
  paddingBottom: `${config.space.S400} !important`,
});

export const PreventSelect = style({
  WebkitUserSelect: 'none',
  msUserSelect: 'none',
  userSelect: 'none',
  MozUserSelect: 'none',
});

export const MessageMobileOptionsWrapped = style({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100vw',
  height: '100%',
  backgroundColor: color.Other.Overlay,
});

export const MessageMobileOptionsWrappedContained = style({
  position: 'absolute',
  width: '100%',
});

export const MessageMobileOptionsContainer = style({
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  width: '100%',
  maxHeight: '85dvh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  overflow: 'visible',
  backgroundColor: color.Surface.Container,
  borderTopLeftRadius: toRem(20),
  borderTopRightRadius: toRem(20),
  boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.15)',
  paddingBottom:
    'var(--mobile-sheet-safe-bottom, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
});

export const MessageMobileOptionsContainerContained = style({
  position: 'absolute',
});

export const MessageMobileSheetFill = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
});

// Ratio is against the keyboard-free height so the picker keeps one size while
// typing. The ceiling only binds where a keyboard would otherwise cover the sheet.
const pickerHeight = `min(max(calc(var(--mobile-sheet-viewport, 100dvh) * 0.5), ${toRem(
  280
)}), var(--mobile-sheet-visible, 100dvh))`;

export const MessageMobileOptionsContainerPicker = style({
  height: pickerHeight,
  maxHeight: pickerHeight,
  boxSizing: 'border-box',
  // `clip` creates no scrollport, so focusing the search input cannot scroll the
  // sheet on top of its own transform. `hidden` is the pre-Chrome-90 fallback.
  overflow: ['hidden', 'clip'],
});

export const MessageMobileDragHandle = style({
  flex: '0 0 32px',
  height: '32px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  boxSizing: 'border-box',
  paddingTop: toRem(8),
  zIndex: 10,
  touchAction: 'none',
  cursor: 'grab',
});

export const MessageMobileDragIndicator = style({
  width: '40px',
  height: '4px',
  borderRadius: '2px',
  backgroundColor: color.SurfaceVariant.OnContainer,
  opacity: 0.5,
});

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
  width: '100%',
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});

export const ReactionAdd = style([
  FocusOutline,
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: `${toRem(2)} ${config.space.S200}`,
    minHeight: toRem(24),
    backgroundColor: color.SurfaceVariant.Container,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R300,
    color: color.SurfaceVariant.OnContainer,
    opacity: config.opacity.P500,
    cursor: 'pointer',

    selectors: {
      '&:hover, &:focus-visible': {
        backgroundColor: color.SurfaceVariant.ContainerHover,
        opacity: 1,
      },
      '&:active': {
        backgroundColor: color.SurfaceVariant.ContainerActive,
      },
      '&[aria-pressed=true]': {
        opacity: 1,
        backgroundColor: color.SurfaceVariant.ContainerHover,
      },
    },
  },
]);

export const MessagePending = style({
  opacity: config.opacity.Placeholder,
});

export const MessageFailed = style({
  opacity: config.opacity.P300,
});

export const SendStatusRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  marginTop: config.space.S100,
});
