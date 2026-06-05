import { style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';

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
