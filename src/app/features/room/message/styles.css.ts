import { style } from '@vanilla-extract/css';
import { DefaultReset, FocusOutline, color, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
  maxWidth: '100%',
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
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
  position: 'absolute',
  bottom: '0',
  display: 'flex',
  flexDirection: 'column',
});

//I have zero clue where these numbers and vars are from but they should be changed
//I just copied the hardcoded value in a more correct place

export const MessageNickEditor = style({
  background: 'var(--mx-c-surface)',
  color: 'var(--mx-c-on-surface)',
  border: '1px solid var(--mx-c-outline)',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
});

export const MessageMobileOptionsWrapped = style({
  position: 'absolute',
  bottom: '0',
  zIndex: '104',
  width: '100%',
  height: '100%',
  backgroundColor: color.Other.Overlay,
});

export const MessageMobileOptionsContainer = style({
  position: 'absolute',
  bottom: '0',
  zIndex: '105',
  width: '100%',
  height: '85%',
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
