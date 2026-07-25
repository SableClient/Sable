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

export const MessageOptionsMenu = style({
  width: '100%',
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
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      height: '300px',
      backgroundColor: 'inherit',
      border: 'none',
    },
  },
});

export const PreventSelect = style({
  WebkitUserSelect: 'none',
  msUserSelect: 'none',
  userSelect: 'none',
  MozUserSelect: 'none',
});
//I have zero clue where these numbers and vars are from but they should be changed
//I just copied the hardcoded value in a more correct place

export const MessageMobileOptionsWrapped = style({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1004,
  width: '100vw',
  height: '100%',
  backgroundColor: color.Other.Overlay,
});

export const MessageMobileOptionsContainer = style({
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1005,
  width: '100%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  overflow: 'visible',
});

export const MessageMobileDragHandle = style({
  position: 'absolute',
  top: '0',
  left: '0',
  right: '0',
  height: '32px',
  display: 'flex',
  alignItems: 'flex-start',
  paddingTop: '6px',
  justifyContent: 'center',
  zIndex: 10,
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
