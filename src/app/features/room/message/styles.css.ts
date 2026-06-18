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
    position: 'absolute',
    top: toRem(-30),
    right: 0,
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

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
